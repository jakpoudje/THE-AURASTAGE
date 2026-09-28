import { describe, expect, it } from "vitest";
import { timelineAudioMixEngine } from "../engine";

const sr = 48000, fps = 24;
const ones = (n: number) => new Float32Array(n).fill(1);
const track = (over = {}) => ({ id: "t1", family: "DX" as const, gain_db: 0, pan: 0, mute: false, solo: false, ...over });
const clip = (over = {}) => ({ track_id: "t1", asset_id: "a1", start_seconds: 0, duration_seconds: 1, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, ...over });
const inp = (over: Record<string, unknown> = {}) => ({
  fps, sample_rate: sr, bus: null,
  audio: [{ record_in: 0, duration: 48, source_in: 0, mix_version_id: "m" }],
  mixes: { m: { seconds: 2, tracks: [track()], clips: [clip()] } },
  pcm: new Map([["a1", { channels: [ones(sr * 2)] }]]),
  ...over,
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
  it("refuses missing recordings and odd sample rates", () => {
    expect(() => timelineAudioMixEngine(inp({ pcm: new Map() }), 0, 10)).toThrow(/Missing recording/);
    expect(() => timelineAudioMixEngine(inp({ sample_rate: 44100, fps: 23 }), 0, 10)).toThrow(/whole number/);
  });
});
