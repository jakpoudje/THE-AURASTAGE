// Signal processing that follows the Web Audio specification, so a mix rendered here matches what the Audio Studio
// played, measured and approved in the browser: BiquadFilterNode coefficients (spec §BiquadFilterNode, Audio EQ
// Cookbook with the spec's Q handling), ConvolverNode impulse normalisation (spec + Chromium's calibration constants),
// StereoPannerNode equal-power gains, DelayNode feedback cycles (one 128-frame render quantum per trip) and
// DynamicsCompressorNode as Chromium's DynamicsCompressorKernel (exponential knee, 6 ms look-ahead, adaptive release,
// automatic make-up gain). Parity with the browser is checked by rendering the same mixes in Chromium (see README).

export const dbToGain = (db: number) => Math.pow(10, db / 20);

// ---------- Biquad filters ----------
export type BiquadType = "highpass" | "lowpass" | "lowshelf" | "peaking" | "highshelf";
export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

export function biquad(type: BiquadType, sr: number, freq: number, q: number, gainDb: number): Biquad {
  const f = Math.min(Math.max(freq, 0), sr / 2);
  const w0 = (2 * Math.PI * f) / sr, cos = Math.cos(w0), sin = Math.sin(w0), A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === "highpass") {
    const alpha = sin / (2 * Math.pow(10, q / 20)); // Web Audio: Q of lowpass/highpass is in dB
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === "lowpass") {
    const alpha = sin / (2 * Math.pow(10, q / 20));
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  } else if (type === "peaking") {
    const alpha = sin / (2 * q);
    b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
  } else {
    const alpha = (sin / 2) * Math.SQRT2, s = 2 * Math.sqrt(A) * alpha; // shelf slope S = 1
    if (type === "lowshelf") {
      b0 = A * (A + 1 - (A - 1) * cos + s); b1 = 2 * A * (A - 1 - (A + 1) * cos); b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s; a1 = -2 * (A - 1 + (A + 1) * cos); a2 = A + 1 + (A - 1) * cos - s;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + s); b1 = -2 * A * (A - 1 + (A + 1) * cos); b2 = A * (A + 1 + (A - 1) * cos - s);
      a0 = A + 1 - (A - 1) * cos + s; a1 = 2 * (A - 1 - (A + 1) * cos); a2 = A + 1 - (A - 1) * cos - s;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Filters a channel in place (direct form I, double precision state). */
export function applyBiquad(x: Float32Array, c: Biquad) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
}

// ---------- Compressor (Chromium's DynamicsCompressorKernel) ----------
export interface CompressorSettings { threshold_db: number; knee_db: number; ratio: number; attack_s: number; release_s: number }
const PRE_DELAY_S = 0.006, DIVISION = 32, SAT_RELEASE_S = 0.0025, SPACING_DB = 5;
const RELEASE_ZONES = [0.09, 0.16, 0.42, 0.98];
const lin2db = (x: number) => (x <= 0 ? -1000 : 20 * Math.log10(x));
const db2lin = (db: number) => Math.pow(10, 0.05 * db);

/** The static curve (linear domain): linear to the threshold, an exponential knee, then 1/ratio in dB. */
export function compressorCurve(s: CompressorSettings) {
  const T = db2lin(s.threshold_db), kneeDb = s.threshold_db + Math.max(0, s.knee_db), kneeT = db2lin(kneeDb), slope = 1 / Math.max(1, s.ratio);
  const kneeCurve = (x: number, k: number) => (x < T ? x : T + (1 - Math.exp(-k * (x - T))) / k);
  const slopeAt = (x: number, k: number) => {
    if (x < T) return 1;
    const x2 = x * 1.001;
    return (lin2db(kneeCurve(x2, k)) - lin2db(kneeCurve(x, k))) / (lin2db(x2) - lin2db(x));
  };
  let minK = 0.1, maxK = 10000, k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeT, k) < slope) maxK = k; else minK = k;
    k = Math.sqrt(minK * maxK);
  }
  const yKneeDb = lin2db(kneeCurve(kneeT, k));
  return (x: number) => (x < kneeT ? kneeCurve(x, k) : db2lin(yKneeDb + slope * (lin2db(x) - kneeDb)));
}

/** Automatic make-up gain of a Web Audio compressor: (1 / gain at full scale)^0.6. */
export function compressorMakeup(s: CompressorSettings) {
  return Math.pow(1 / compressorCurve(s)(1), 0.6);
}

/**
 * Compresses 1–2 linked channels in place exactly as Chromium's DynamicsCompressorKernel: the level is detected on
 * the undelayed signal and applied 6 ms later, with its saturating detector, attack toward the desired gain,
 * adaptive release (4th-order curve through the release zones), the sine warp of the gain, and automatic make-up.
 */
export function applyCompressor(ch: Float32Array[], sr: number, s: CompressorSettings) {
  const n = ch[0].length, pre = Math.round(PRE_DELAY_S * sr);
  const saturate = compressorCurve(s);
  const makeup = compressorMakeup(s);
  const attackFrames = Math.max(0.001, s.attack_s) * sr, releaseFrames = sr * s.release_s, satReleaseFrames = SAT_RELEASE_S * sr;
  const [y1, y2, y3, y4] = RELEASE_ZONES.map((z) => releaseFrames * z);
  const kA = 0.9999999999999998 * y1 + 1.8432219684323923e-16 * y2 - 1.9373394351676423e-16 * y3 + 8.824516011816245e-18 * y4;
  const kB = -1.5788320352845888 * y1 + 2.3305837032074286 * y2 - 0.9141194204840429 * y3 + 0.1623677525612032 * y4;
  const kC = 0.5334142869106424 * y1 - 1.272736789213631 * y2 + 0.9258856042207512 * y3 - 0.18656310191776226 * y4;
  const kD = 0.08783463138207234 * y1 - 0.1694162967925622 * y2 + 0.08588057951595272 * y3 - 0.00429891410546283 * y4;
  const kE = -0.042416883008123074 * y1 + 0.1115693827987602 * y2 - 0.09764676325265872 * y3 + 0.028494263462021576 * y4;
  const src = ch.map((c) => c.slice());
  let detector = 0, gain = 1, maxAttackDiff = -1;
  for (let d0 = 0; d0 < n; d0 += DIVISION) {
    const desired = Math.asin(Math.min(1, detector)) / (Math.PI / 2);
    let diff = lin2db(gain / desired);
    let envelopeRate: number;
    if (desired > gain) {
      // Releasing (diff is negative dB): larger compression releases faster.
      maxAttackDiff = -1;
      if (!Number.isFinite(diff)) diff = -1;
      const x = 0.25 * (Math.min(0, Math.max(-12, diff)) + 12), x2 = x * x;
      const frames = kA + kB * x + kC * x2 + kD * x2 * x + kE * x2 * x2;
      envelopeRate = db2lin(SPACING_DB / frames);
    } else {
      // Attacking (diff is positive dB).
      if (!Number.isFinite(diff)) diff = 1;
      if (maxAttackDiff === -1 || maxAttackDiff < diff) maxAttackDiff = diff;
      envelopeRate = 1 - Math.pow(0.25 / Math.max(0.5, maxAttackDiff), 1 / attackFrames);
    }
    for (let i = d0; i < Math.min(n, d0 + DIVISION); i++) {
      let peak = 0;
      for (const c of src) peak = Math.max(peak, Math.abs(c[i]));
      const attenuation = peak <= 0.0001 ? 1 : saturate(peak) / peak;
      const attDb = Math.max(2, -lin2db(attenuation));
      const satReleaseRate = db2lin(attDb / satReleaseFrames) - 1;
      detector += (attenuation - detector) * (attenuation > detector ? satReleaseRate : 1);
      detector = Math.min(1, detector);
      if (envelopeRate < 1) gain += (desired - gain) * envelopeRate;
      else gain = Math.min(1, gain * envelopeRate);
      const total = makeup * Math.sin((Math.PI / 2) * gain);
      for (let k = 0; k < ch.length; k++) ch[k][i] = (i >= pre ? src[k][i - pre] : 0) * total;
    }
  }
}

// ---------- Stereo panner ----------
/** StereoPannerNode: equal-power pan of a mono or stereo signal into a new stereo pair. */
export function pan(ch: Float32Array[], p: number): [Float32Array, Float32Array] {
  const n = ch[0].length, L = new Float32Array(n), R = new Float32Array(n), q = Math.max(-1, Math.min(1, p));
  if (ch.length === 1) {
    const x = ((q + 1) / 2) * (Math.PI / 2), gl = Math.cos(x), gr = Math.sin(x), m = ch[0];
    for (let i = 0; i < n; i++) (L[i] = m[i] * gl), (R[i] = m[i] * gr);
    return [L, R];
  }
  const x = (q <= 0 ? q + 1 : q) * (Math.PI / 2), gl = Math.cos(x), gr = Math.sin(x), a = ch[0], b = ch[1];
  if (q <= 0) for (let i = 0; i < n; i++) (L[i] = a[i] + b[i] * gl), (R[i] = b[i] * gr);
  else for (let i = 0; i < n; i++) (L[i] = a[i] * gl), (R[i] = b[i] + a[i] * gr);
  return [L, R];
}

// ---------- Reverb impulse (identical to the browser's) and convolution ----------
export type ReverbType = "room" | "hall" | "plate";
/** The Audio Studio's deterministic impulse: decaying noise shaped by the room type (same seed, same maths). */
export function reverbImpulse(sr: number, type: ReverbType, decay: number): [Float32Array, Float32Array] {
  const len = Math.max(1, Math.floor(sr * Math.min(8, decay * 1.2)));
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  let seed = type === "room" ? 7 : type === "hall" ? 11 : 13;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const smooth = type === "room" ? 0.6 : type === "hall" ? 0.35 : 0.05;
  for (let ch = 0; ch < 2; ch++) {
    const d = out[ch];
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, env = Math.exp((-6.9 * t) / decay);
      prev = prev * smooth + rnd() * (1 - smooth);
      d[i] = prev * env * (type === "room" && t < 0.08 && i % 331 === 0 ? 3 : 1);
    }
  }
  return out;
}

/** ConvolverNode normalisation (normalize = true, the default): Chromium's power-based scale with its calibration. */
export function convolverScale(ir: Float32Array[], sr: number) {
  let sum = 0, len = 0;
  for (const c of ir) { for (let i = 0; i < c.length; i++) sum += c[i] * c[i]; len = c.length; }
  let power = Math.sqrt(sum / (ir.length * Math.max(1, len)));
  if (!Number.isFinite(power) || power < 0.000125) power = 0.000125;
  return (1 / power) * Math.pow(10, -58 * 0.05) * (44100 / sr);
}

function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / size, wr = Math.cos(ang), wi = Math.sin(ang), half = size >> 1;
    for (let s = 0; s < n; s += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = s + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

/** Uniformly partitioned FFT convolution (overlap-add): output has the input's length (the tail past it is dropped). */
export function convolve(x: Float32Array, h: Float32Array, scale = 1): Float32Array {
  const n = x.length, out = new Float32Array(n);
  if (!n || !h.length) return out;
  const B = 4096, N = 2 * B, P = Math.ceil(h.length / B);
  const Hr: Float64Array[] = [], Hi: Float64Array[] = [];
  for (let p = 0; p < P; p++) {
    const r = new Float64Array(N), i = new Float64Array(N);
    for (let k = 0; k < B && p * B + k < h.length; k++) r[k] = h[p * B + k] * scale;
    fft(r, i, false);
    Hr.push(r); Hi.push(i);
  }
  const blocks = Math.ceil(n / B);
  const Xr: Float64Array[] = [], Xi: Float64Array[] = []; // frequency-domain delay line, newest first
  const accR = new Float64Array(N), accI = new Float64Array(N);
  let overlap = new Float64Array(B);
  for (let b = 0; b < blocks; b++) {
    const r = new Float64Array(N), i = new Float64Array(N);
    for (let k = 0; k < B && b * B + k < n; k++) r[k] = x[b * B + k];
    fft(r, i, false);
    Xr.unshift(r); Xi.unshift(i);
    if (Xr.length > P) (Xr.pop(), Xi.pop());
    accR.fill(0); accI.fill(0);
    for (let p = 0; p < Xr.length; p++) {
      const ar = Xr[p], ai = Xi[p], hr = Hr[p], hi = Hi[p];
      for (let k = 0; k < N; k++) { accR[k] += ar[k] * hr[k] - ai[k] * hi[k]; accI[k] += ar[k] * hi[k] + ai[k] * hr[k]; }
    }
    fft(accR, accI, true);
    for (let k = 0; k < B && b * B + k < n; k++) out[b * B + k] = accR[k] + overlap[k];
    overlap = accR.slice(B, N);
  }
  return out;
}

/** A pure delay by d samples (length kept). */
export function delayBy(x: Float32Array, d: number): Float32Array {
  const out = new Float32Array(x.length);
  if (d < x.length) out.set(x.subarray(0, x.length - d), d);
  return out;
}

/** Web Audio renders in 128-frame blocks; a feedback cycle through a DelayNode adds one block per trip. */
export const RENDER_QUANTUM = 128;
/**
 * DelayNode in a feedback loop, as the browser renders it: the first echo after D samples, each repeat another
 * D + 128 samples later (measured in Chromium: impulse at 100 → 4900, 9828, 14756 … for D = 4800).
 * v[n] = x[n] + fb·v[n − 128] feeds the delay line; y[n] = v[n − D].
 */
export function feedbackDelay(x: Float32Array, d: number, fb: number): Float32Array {
  const n = x.length, v = new Float32Array(n), y = new Float32Array(n);
  const loop = d + RENDER_QUANTUM;
  for (let i = 0; i < n; i++) v[i] = x[i] + (i >= loop ? fb * v[i - loop] : 0);
  for (let i = d; i < n; i++) y[i] = v[i - d];
  return y;
}
