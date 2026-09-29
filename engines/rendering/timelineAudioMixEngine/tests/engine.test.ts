import { describe, expect, it } from "vitest";
import { timelineAudioMixEngine } from "../engine";

const sr = 48000, fps = 24;
const ones = (n: number) => new Float32Array(n).fill(1);
const track = (over = {}) => ({ id: "t1", family: "DX" as const, gain_db: 0, pan: 0, mute: false, solo: false, ...over });
const clip = (over = {}) => ({ track_id: "t1", asset_id: "a1", start_seconds: 0, duration_seconds: 1, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, ...over });
// These cases check placement, gain, pan and stems with the master limiter off (so values are exact); the studio chain
// itself is tested in engines/audio/studioMixRenderEngine and against the browser in tests/e2e/audio-parity.
const NO_LIMIT = { master: { gain_db: 0, limiter: false, ceiling_db: -1 } };
const withMix = (mixes: Record<string, any>) => Object.fromEntries(Object.entries(mixes).map(([k, v]) => [k, { mix: NO_LIMIT, ...v }]));
const inp = (over: Record<string, unknown> = {}) => ({
  fps, sample_rate: sr, bus: null,
  audio: [{ record_in: 0, duration: 48, source_in: 0, mix_version_id: "m" }],
  pcm: new Map([["a1", { channels: [ones(sr * 2)] }]]),
  ...over,
  mixes: withMix((over.mixes as Record<string, unknown>) ?? { m: { seconds: 2, tracks: [track()], clips: [clip()] } }),
}) as any;

describe("timelineAudioMixEngine", () => {
  it("centre-panned mono is equal-power (-3 dB each side), like Web Audio", () => {
    const [L, R] = timelineAudioMixEngine(inp(), 0, sr * 2);
    expect(L[100]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(R[100]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(L[sr + 10]).toBe(0); // clip is 1 s long
  });
  it("applies clip + track gain, hard pans and stereo panning like StereoPannerNode", () => {
    let [L, R] = timelineAudioMixEngine(inp({ mixes: { m: { seconds: 2, tracks: [track({ pan: -1, gain_db: -6 })], clips: [clip({ gain_db: -6 })] } } }), 0, 10);
    expect(L[0]).toBeCloseTo(Math.pow(10, -12 / 20), 5);
    expect(R[0]).toBeCloseTo(0, 6);
    [L, R] = timelineAudioMixEngine(inp({ pcm: new Map([["a1", { channels: [ones(sr), ones(sr).fill(0.5)] }]]), mixes: { m: { seconds: 2, tracks: [track({ pan: 1 })], clips: [clip()] } } }), 0, 10);
    expect(L[0]).toBeCloseTo(0, 6); // left moved fully into the right
    expect(R[0]).toBeCloseTo(1.5, 5);
  });
  it("linear fades in and out", () => {
    const [L] = timelineAudioMixEngine(inp({ mixes: { m: { seconds: 2, tracks: [track({ pan: -1 })], clips: [clip({ fade_in_seconds: 0.5, fade_out_seconds: 0.5 })] } } }), 0, sr);
    expect(L[0]).toBe(0);
    expect(L[sr / 4]).toBeCloseTo(0.5, 3);
    expect(L[sr / 2 + 1]).toBeCloseTo(1, 3);
    expect(L[sr - sr / 4]).toBeCloseTo(0.5, 3);
  });
  it("maps the A1 clip's source offset and record position; chunks add up to the whole", () => {
    const i = inp({ audio: [{ record_in: 24, duration: 24, source_in: 12, mix_version_id: "m" }], mixes: { m: { seconds: 2, tracks: [track({ pan: -1 })], clips: [clip({ start_seconds: 0.75, duration_seconds: 0.5 })] } } });
    const [L] = timelineAudioMixEngine(i, 0, sr * 2);
    // scene 0.75 s is timeline 1.0 + (0.75 - 0.5) = 1.25 s
    expect(L[Math.round(1.25 * sr) - 1]).toBe(0);
    expect(L[Math.round(1.25 * sr)]).toBeCloseTo(1, 5);
    const a = timelineAudioMixEngine(i, 0, sr)[0], b = timelineAudioMixEngine(i, sr, sr)[0];
    expect(Array.from(a).concat(Array.from(b))).toEqual(Array.from(L));
  });
  it("mute, solo and bus stems (ME excludes dialogue)", () => {
    const mixes = { m: { seconds: 2, tracks: [track({ pan: -1 }), track({ id: "t2", family: "FX", pan: -1 })], clips: [clip(), clip({ track_id: "t2" })] } };
    expect(timelineAudioMixEngine(inp({ mixes }), 0, 4)[0][0]).toBeCloseTo(2, 5);
    expect(timelineAudioMixEngine(inp({ mixes, bus: "DX" }), 0, 4)[0][0]).toBeCloseTo(1, 5);
    expect(timelineAudioMixEngine(inp({ mixes, bus: "ME" }), 0, 4)[0][0]).toBeCloseTo(1, 5);
    mixes.m.tracks[1] = { ...mixes.m.tracks[1], solo: true };
    expect(timelineAudioMixEngine(inp({ mixes }), 0, 4)[0][0]).toBeCloseTo(1, 5);
  });
  it("scene mixes keep their studio processing: bus gain, channel strip and the master limiter reach the render", () => {
    const quiet = inp({ mixes: { m: { seconds: 2, tracks: [track({ pan: -1 })], clips: [clip()], mix: { ...NO_LIMIT, buses: { DX: { gain_db: -6, mute: false } } } } } });
    expect(timelineAudioMixEngine(quiet, 0, 10)[0][5]).toBeCloseTo(Math.pow(10, -6 / 20), 5);
    const eq = inp({ mixes: { m: { seconds: 2, tracks: [track({ pan: -1, fx: { hpf_hz: 200 } })], clips: [clip()] } } });
    expect(Math.abs(timelineAudioMixEngine(eq, 0, sr)[0][sr / 2])).toBeLessThan(0.01); // DC removed by the high-pass
    const limited = { ...inp(), mixes: { m: { seconds: 2, tracks: [track({ pan: -1 })], clips: [clip()] } } }; // neutral mix: limiter on
    const [Ll] = timelineAudioMixEngine(limited as any, 0, sr);
    expect(Ll[sr / 2]).toBeLessThan(1); // full scale is held down by the limiter
    expect(Ll[sr / 2]).toBeGreaterThan(0.8);
  });
  it("timeline volume automation shapes the cut (dB lines between frames), the same in every chunk", () => {
    const automation = [{ frame: 0, db: 0 }, { frame: 24, db: -20 }];
    const i = inp({ automation, mixes: { m: { seconds: 2, tracks: [track({ pan: -1 })], clips: [clip({ duration_seconds: 2 })] } } });
    const [L] = timelineAudioMixEngine(i, 0, sr);
    expect(L[0]).toBeCloseTo(1, 5);
    expect(L[sr / 2]).toBeCloseTo(Math.pow(10, -10 / 20), 4); // frame 12 of 24: half-way down the ramp, -10 dB
    expect(L[sr / 4]).toBeCloseTo(Math.pow(10, -5 / 20), 4); // frame 6: -5 dB
    const [L2] = timelineAudioMixEngine(i, sr, 200);
    expect(L2[100]).toBeCloseTo(0.1, 5); // after the last point the level holds at -20 dB
    const a = timelineAudioMixEngine(i, 0, sr / 2)[0], b = timelineAudioMixEngine(i, sr / 2, sr / 2)[0];
    expect(a[sr / 4]).toBeCloseTo(L[sr / 4], 7);
    expect(b[10]).toBeCloseTo(L[sr / 2 + 10], 7);
  });
  it("refuses missing recordings and odd sample rates", () => {
    expect(() => timelineAudioMixEngine(inp({ pcm: new Map() }), 0, 10)).toThrow(/Missing recording/);
    expect(() => timelineAudioMixEngine(inp({ sample_rate: 44100, fps: 23 }), 0, 10)).toThrow(/whole number/);
  });
});
