// ITU-R BS.1770-4 constants and K-weighting filter design for any sample rate
// (same analytic design as the 48 kHz coefficients printed in the standard).

export const ABSOLUTE_GATE_LUFS = -70;
export const RELATIVE_GATE_LU = -10; // integrated loudness
export const LRA_RELATIVE_GATE_LU = -20; // EBU Tech 3342
export const BLOCK_SECONDS = 0.4; // momentary gating block
export const BLOCK_STEP_SECONDS = 0.1; // 75% overlap
export const SHORT_TERM_SECONDS = 3; // LRA
export const OVERSAMPLE = 4; // true peak

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

export function kWeighting(fs: number): [Biquad, Biquad] {
  // Exact K-weighting for any sample rate (libebur128 derivation; reproduces the
  // 48 kHz coefficients printed in BS.1770-4).
  // Stage 1: high-shelf (head acoustics)
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: RLB high-pass
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / fs), d0 = 1 + K1 / Q1 + K1 * K1;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K1 * K1 - 1)) / d0, a2: (1 - K1 / Q1 + K1 * K1) / d0 };
  return [shelf, hp];
}

export function applyBiquad(x: Float32Array | Float64Array, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n];
    const yn = f.b0 * xn + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
    y[n] = yn;
  }
  return y;
}

/** Windowed-sinc polyphase kernel for 4x oversampling (true-peak estimate). */
export function oversampleKernel(taps = 48): Float64Array[] {
  const L = OVERSAMPLE, half = taps / 2;
  const phases: Float64Array[] = [];
  for (let p = 0; p < L; p++) {
    const k = new Float64Array(taps);
    for (let i = 0; i < taps; i++) {
      const t = i - half + 1 - p / L;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const win = 0.5 * (1 - Math.cos((2 * Math.PI * (i + p / L)) / taps)); // Hann
      k[i] = sinc * win;
    }
    phases.push(k);
  }
  return phases;
}
