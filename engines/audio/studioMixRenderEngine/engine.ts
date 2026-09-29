// engines/audio/studioMixRenderEngine
// Renders one approved Audio Studio mix offline, with the same chain the browser uses for playback, measurement and
// export (apps/web/src/modules/audio-studio/state/mixEngine.ts buildGraph):
//   clip gain + fades → track fader + volume automation → high-pass → low shelf → mid bell → high shelf →
//   compressor (+ make-up) → pan → department bus (DX/FX/BG/MX) → master gain → limiter,
//   with post-fader sends into a shared reverb (pre-delay → convolution with the studio's impulse) and a feedback delay.
// A stem (one bus, or ME = everything but dialogue) keeps its own share of the reverb/delay and the master chain, as the
// Audio Studio's stem export does. Used by the render worker so exported films sound like the approved mixes.
import { FAMILY_BUS } from "@aurastage/contracts";
import {
  applyBiquad, applyCompressor, biquad, convolve, convolverScale, dbToGain, delayBy, feedbackDelay, pan, reverbImpulse,
} from "./dsp";
import { StudioMixSchema, type Pcm, type StudioBus, type StudioMix, type StudioTrack } from "./input.schema";

export class StudioMixRenderError extends Error {
  code = "AURA-AUD-MIX";
}

/** Tracks that make sound: not muted, and soloed ones only when any track is soloed. */
function audible(tracks: StudioTrack[]) {
  const solo = tracks.some((t) => t.solo);
  return tracks.filter((t) => !t.mute && (!solo || t.solo));
}
const inBus = (t: StudioTrack, bus: StudioBus) =>
  bus === null || (bus === "ME" ? FAMILY_BUS[t.family] !== "DX" : FAMILY_BUS[t.family] === bus);

/** Fader + automation gain per sample: setValueAtTime(start value) then linear ramps between the points (as scheduled). */
function faderCurve(t: StudioTrack, n: number, sr: number): Float32Array | number {
  const pts = [...t.fx.automation].sort((a, b) => a.t - b.t);
  if (!pts.length) return dbToGain(t.gain_db);
  const first = pts[0].db; // automationAt(0): the first point's value holds before it
  const ev = [{ s: 0, g: dbToGain(t.gain_db + first) }, ...pts.filter((p) => p.t > 0).map((p) => ({ s: p.t * sr, g: dbToGain(t.gain_db + p.db) }))];
  const out = new Float32Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) {
    while (e + 1 < ev.length && ev[e + 1].s <= i) e++;
    const a = ev[e], b = ev[e + 1];
    out[i] = b ? a.g + ((b.g - a.g) * (i - a.s)) / (b.s - a.s) : a.g;
  }
  return out;
}

/** Sum of a track's placed recordings (mono if every one is mono, else stereo), with clip gain and fades. */
function trackSignal(t: StudioTrack, mix: StudioMix, pcm: Map<string, Pcm>, n: number, sr: number): Float32Array[] | null {
  const clips = mix.clips.filter((c) => c.track_id === t.id);
  if (!clips.length) return null;
  const bufs = clips.map((c) => {
    const b = pcm.get(c.asset_id);
    if (!b) throw new StudioMixRenderError(`Missing recording ${c.asset_id}`);
    return b;
  });
  const stereo = bufs.some((b) => b.channels.length > 1);
  const out = stereo ? [new Float32Array(n), new Float32Array(n)] : [new Float32Array(n)];
  clips.forEach((c, k) => {
    const b = bufs[k], len = b.channels[0].length;
    const cs = Math.round(c.start_seconds * sr), off = Math.round(c.offset_seconds * sr), dur = Math.round(c.duration_seconds * sr);
    const play = Math.min(dur, len - off);
    if (play <= 0) return;
    const fi = Math.round(c.fade_in_seconds * sr), fo = Math.round(c.fade_out_seconds * sr), level = dbToGain(c.gain_db);
    for (let tau = Math.max(0, -cs); tau < play && cs + tau < n; tau++) {
      let g = level;
      if (fi > 0 && tau < fi) g *= tau / fi;
      if (fo > 0 && tau > dur - fo) g *= Math.max(0, dur - tau) / fo;
      const o = cs + tau, s = off + tau;
      if (stereo) {
        const l = b.channels[0][s], r = (b.channels[1] ?? b.channels[0])[s]; // mono clips up-mix to both sides
        out[0][o] += l * g; out[1][o] += r * g;
      } else out[0][o] += b.channels[0][s] * g;
    }
  });
  return out;
}

/** Renders the mix (or one stem) to stereo float PCM at `sample_rate`, scene length. */
export function studioMixRenderEngine(raw: unknown, pcm: Map<string, Pcm>, sample_rate: number, bus: StudioBus = null): [Float32Array, Float32Array] {
  const parsed = StudioMixSchema.safeParse(raw);
  if (!parsed.success) throw new StudioMixRenderError(`Invalid mix: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const m = parsed.data, sr = sample_rate, n = Math.max(1, Math.ceil(m.seconds * sr)), mix = m.mix;
  const busses: Record<"DX" | "FX" | "BG" | "MX", [Float32Array, Float32Array]> = {
    DX: [new Float32Array(n), new Float32Array(n)], FX: [new Float32Array(n), new Float32Array(n)],
    BG: [new Float32Array(n), new Float32Array(n)], MX: [new Float32Array(n), new Float32Array(n)],
  };
  let revIn: [Float32Array, Float32Array] | null = null, dlyIn: [Float32Array, Float32Array] | null = null;
  const addInto = (dst: [Float32Array, Float32Array], src: [Float32Array, Float32Array], g = 1) => {
    for (let i = 0; i < n; i++) (dst[0][i] += src[0][i] * g), (dst[1][i] += src[1][i] * g);
  };

  for (const t of audible(m.tracks)) {
    if (!inBus(t, bus)) continue;
    const sig = trackSignal(t, m, pcm, n, sr) as Float32Array[] | null;
    if (!sig) continue;
    const fx = t.fx;
    const fader = faderCurve(t, n, sr);
    for (const ch of sig) for (let i = 0; i < n; i++) ch[i] *= typeof fader === "number" ? fader : fader[i];
    const filters = [
      fx.hpf_hz > 0 ? biquad("highpass", sr, fx.hpf_hz, 0.707, 0) : null,
      fx.eq.low.gain_db !== 0 ? biquad("lowshelf", sr, fx.eq.low.freq, 1, fx.eq.low.gain_db) : null,
      fx.eq.mid.gain_db !== 0 ? biquad("peaking", sr, fx.eq.mid.freq, fx.eq.mid.q, fx.eq.mid.gain_db) : null,
      fx.eq.high.gain_db !== 0 ? biquad("highshelf", sr, fx.eq.high.freq, 1, fx.eq.high.gain_db) : null,
    ];
    for (const f of filters) if (f) for (const ch of sig) applyBiquad(ch, f);
    // DynamicsCompressorNode always outputs two channels: a mono track leaves it up-mixed (L = R), so the panner then
    // treats it as stereo (measured in Chromium: +3 dB at centre compared with a mono pan).
    if (fx.comp.on && sig.length === 1) sig.push(sig[0].slice());
    if (fx.comp.on) {
      applyCompressor(sig, sr, { threshold_db: fx.comp.threshold_db, knee_db: 6, ratio: fx.comp.ratio, attack_s: fx.comp.attack_ms / 1000, release_s: fx.comp.release_ms / 1000 });
      if (fx.comp.makeup_db) { const g = dbToGain(fx.comp.makeup_db); for (const ch of sig) for (let i = 0; i < n; i++) ch[i] *= g; }
    }
    const st = pan(sig, t.pan);
    addInto(busses[FAMILY_BUS[t.family]], st);
    if (fx.reverb_send_db > -60) addInto((revIn ??= [new Float32Array(n), new Float32Array(n)]), st, dbToGain(fx.reverb_send_db));
    if (fx.delay_send_db > -60) addInto((dlyIn ??= [new Float32Array(n), new Float32Array(n)]), st, dbToGain(fx.delay_send_db));
  }

  // Master = buses + effect returns → master gain → limiter.
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (const b of ["DX", "FX", "BG", "MX"] as const) if (!mix.buses[b].mute) addInto(out, busses[b], dbToGain(mix.buses[b].gain_db));
  if (revIn) {
    const pre = Math.round((mix.reverb.pre_delay_ms / 1000) * sr);
    const ir = reverbImpulse(sr, mix.reverb.type, mix.reverb.decay_s), scale = convolverScale(ir, sr);
    const ret = dbToGain(mix.reverb.return_db) * 0.35;
    const wet: [Float32Array, Float32Array] = [convolve(delayBy(revIn[0], pre), ir[0], scale), convolve(delayBy(revIn[1], pre), ir[1], scale)];
    addInto(out, wet, ret);
  }
  if (dlyIn) {
    const d = Math.max(1, Math.round((mix.delay.time_ms / 1000) * sr));
    addInto(out, [feedbackDelay(dlyIn[0], d, mix.delay.feedback), feedbackDelay(dlyIn[1], d, mix.delay.feedback)], dbToGain(mix.delay.return_db));
  }
  const mg = dbToGain(mix.master.gain_db);
  if (mg !== 1) for (const ch of out) for (let i = 0; i < n; i++) ch[i] *= mg;
  if (mix.master.limiter) applyCompressor(out, sr, { threshold_db: mix.master.ceiling_db - 1, knee_db: 0, ratio: 20, attack_s: 0.001, release_s: 0.08 });
  return out;
}
