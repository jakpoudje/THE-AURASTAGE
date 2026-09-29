import { describe, expect, it } from "vitest";
import { studioMixRenderEngine } from "../engine";
import { compressorMakeup, convolve } from "../dsp";

const SR = 48000;
const sine = (hz: number, sec: number, amp = 0.1) => {
  const n = Math.round(sec * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
};
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const track = (id: string, family: string, over: Record<string, unknown> = {}) => ({ id, family, gain_db: 0, pan: 0, mute: false, solo: false, ...over });
const clip = (track_id: string, asset_id: string, seconds: number, over: Record<string, unknown> = {}) =>
  ({ track_id, asset_id, start_seconds: 0, duration_seconds: seconds, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, ...over });
const LIMITER_MAKEUP = compressorMakeup({ threshold_db: -2, knee_db: 0, ratio: 20, attack_s: 0.001, release_s: 0.08 });
const LOOKAHEAD = Math.round(0.006 * SR);
const NO_LIMIT = { master: { gain_db: 0, limiter: false, ceiling_db: -1 } };

describe("studioMixRenderEngine (the Audio Studio chain, offline)", () => {
  it("neutral mix: equal-power centre pan, the default limiter's 6 ms look-ahead and automatic make-up (as the browser)", () => {
    const x = sine(440, 1, 0.1);
    const [L, R] = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "DX")], clips: [clip("t", "a", 1)] }, new Map([["a", { channels: [x] }]]), SR);
    expect(LIMITER_MAKEUP).toBeCloseTo(Math.pow(10, (1.9 * 0.6) / 20), 6);
    const k = 10000;
    expect(L[k + LOOKAHEAD]).toBeCloseTo(x[k] * Math.SQRT1_2 * LIMITER_MAKEUP, 4);
    expect(R[k + LOOKAHEAD]).toBeCloseTo(L[k + LOOKAHEAD], 6);
  });
  it("limiter holds a full-scale signal near the ceiling; turning it off passes it straight through", () => {
    const x = sine(100, 1, 1);
    const pcm = new Map([["a", { channels: [x, x] }]]);
    const on = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "MX")], clips: [clip("t", "a", 1)] }, pcm, SR);
    let peak = 0;
    for (let i = SR / 4; i < SR; i++) peak = Math.max(peak, Math.abs(on[0][i]));
    expect(20 * Math.log10(peak)).toBeLessThan(-0.3); // -1.9 dB of reduction, +1.1 dB make-up, as Web Audio
    const off = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "MX")], clips: [clip("t", "a", 1)], mix: { master: { gain_db: 0, limiter: false, ceiling_db: -1 } } }, pcm, SR);
    expect(off[0][SR / 2]).toBeCloseTo(x[SR / 2], 5); // stereo input, centre pan: left passes unchanged
  });
  it("channel strip: +12 dB bell at 1 kHz lifts a 1 kHz tone ~4×; the high-pass removes 50 Hz", () => {
    const tone = sine(1000, 1, 0.01), hum = sine(50, 1, 0.01);
    const pcm = new Map([["t1k", { channels: [tone] }], ["h", { channels: [hum] }]]);
    const base = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "DX")], clips: [clip("t", "t1k", 1)] }, pcm, SR);
    const eq = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "DX", { fx: { eq: { mid: { freq: 1000, gain_db: 12, q: 1 } } } })], clips: [clip("t", "t1k", 1)] }, pcm, SR);
    expect(rms(eq[0], SR / 2) / rms(base[0], SR / 2)).toBeCloseTo(Math.pow(10, 12 / 20), 1);
    const hp = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "BG", { fx: { hpf_hz: 300 } })], clips: [clip("t", "h", 1)] }, pcm, SR);
    const flat = studioMixRenderEngine({ seconds: 1, tracks: [track("t", "BG")], clips: [clip("t", "h", 1)] }, pcm, SR);
    expect(rms(hp[0], SR / 2) / rms(flat[0], SR / 2)).toBeLessThan(0.05);
  });
  it("volume automation ramps between points; clip fades and gain apply", () => {
    const x = new Float32Array(SR * 2).fill(0.1);
    const pcm = new Map([["a", { channels: [x] }]]);
    const [L] = studioMixRenderEngine({ seconds: 2, tracks: [track("t", "MX", { fx: { automation: [{ t: 0, db: 0 }, { t: 1, db: -20 }] } })], clips: [clip("t", "a", 2)], mix: NO_LIMIT }, pcm, SR);
    const at = (s: number) => L[Math.round(s * SR)] / (0.1 * Math.SQRT1_2);
    expect(at(0.01)).toBeCloseTo(1, 1);
    expect(at(0.5)).toBeCloseTo((1 + 0.1) / 2, 2); // linear in gain, as linearRampToValueAtTime
    expect(at(1.5)).toBeCloseTo(0.1, 3);
    const [F] = studioMixRenderEngine({ seconds: 2, tracks: [track("t", "MX")], clips: [clip("t", "a", 2, { fade_in_seconds: 1, gain_db: -6 })], mix: NO_LIMIT }, pcm, SR);
    expect(F[Math.round(0.5 * SR)] / (0.1 * Math.SQRT1_2)).toBeCloseTo(0.5 * Math.pow(10, -6 / 20), 3);
  });
  it("routing: bus gain/mute, mute/solo, reverb send leaves a tail, stems (DX, ME) keep only their tracks", () => {
    const burst = new Float32Array(SR); for (let i = 0; i < SR / 10; i++) burst[i] = 0.1 * Math.sin(i / 3);
    const pcm = new Map([["d", { channels: [burst] }], ["m", { channels: [sine(220, 1, 0.1)] }]]);
    const tracks = [track("dx", "DX"), track("mx", "SCORE")];
    const clips = [clip("dx", "d", 1), clip("mx", "m", 1)];
    const full = studioMixRenderEngine({ seconds: 1, tracks, clips, mix: NO_LIMIT }, pcm, SR);
    const dx = studioMixRenderEngine({ seconds: 1, tracks, clips, mix: NO_LIMIT }, pcm, SR, "DX");
    const me = studioMixRenderEngine({ seconds: 1, tracks, clips, mix: NO_LIMIT }, pcm, SR, "ME");
    expect(rms(dx[0], SR / 2)).toBe(0); // the dialogue burst is over; the score is not in the DX stem
    expect(rms(me[0], 0, SR / 20)).toBeCloseTo(rms(full[0], SR / 2), 2); // ME = only the score
    const mutedBus = studioMixRenderEngine({ seconds: 1, tracks, clips, mix: { buses: { MX: { gain_db: 0, mute: true } } } }, pcm, SR);
    expect(rms(mutedBus[0], SR / 2)).toBe(0);
    const solo = studioMixRenderEngine({ seconds: 1, tracks: [track("dx", "DX", { solo: true }), track("mx", "SCORE")], clips }, pcm, SR);
    expect(rms(solo[0], SR / 2)).toBe(0);
    const wet = studioMixRenderEngine({ seconds: 1, tracks: [track("dx", "DX", { fx: { reverb_send_db: 0 } })], clips: [clip("dx", "d", 1)], mix: { reverb: { type: "hall", decay_s: 2, pre_delay_ms: 20, return_db: 0 } } }, pcm, SR);
    expect(rms(wet[0], SR / 2)).toBeGreaterThan(1e-4); // reverb tail after the burst
  });
  it("partitioned FFT convolution equals direct convolution", () => {
    const x = new Float32Array(9000).map((_, i) => Math.sin(i * 0.37) * (i % 7 === 0 ? 1 : 0.2));
    const h = new Float32Array(5000).map((_, i) => Math.exp(-i / 800) * Math.cos(i * 0.11));
    const y = convolve(x, h, 0.5);
    for (const n of [0, 17, 4095, 4096, 8191, 8999]) {
      let s = 0;
      for (let k = 0; k <= n && k < h.length; k++) s += x[n - k] * h[k];
      expect(y[n]).toBeCloseTo(0.5 * s, 3);
    }
  });
  it("refuses a mix whose recording is missing", () => {
    expect(() => studioMixRenderEngine({ seconds: 1, tracks: [track("t", "DX")], clips: [clip("t", "gone", 1)] }, new Map(), SR)).toThrow(/Missing recording gone/);
  });
});
