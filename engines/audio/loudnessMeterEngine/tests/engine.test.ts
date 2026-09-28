import { describe, expect, it } from "vitest";
import { loudnessMeterEngine } from "../engine";

const FS = 48000;
const sine = (freq: number, amp: number, seconds: number, phase = 0) => {
  const x = new Float32Array(Math.round(FS * seconds));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / FS + phase);
  return x;
};

describe("loudnessMeterEngine (ITU-R BS.1770-4)", () => {
  it("full-scale 997 Hz sine in one channel measures -3.01 LUFS (the standard's reference)", () => {
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [sine(997, 1, 10)] });
    expect(r.integrated_lufs!).toBeCloseTo(-3.01, 1);
  });

  it("the same sine in both stereo channels adds +3 dB (0 LUFS)", () => {
    const s = sine(997, 1, 10);
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [s, s.slice()] });
    expect(r.integrated_lufs!).toBeCloseTo(0, 1);
  });

  it("-20 dB of level is -20 LU of loudness", () => {
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [sine(997, 0.1, 10)] });
    expect(r.integrated_lufs!).toBeCloseTo(-23.01, 1);
  });

  it("gates out silence: a quiet gap doesn't drag the integrated value down", () => {
    const tone = sine(997, 0.1, 5);
    const withGap = new Float32Array(tone.length * 2);
    withGap.set(tone, 0); // 5 s tone + 5 s digital silence
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [withGap] });
    expect(r.integrated_lufs!).toBeCloseTo(-23.01, 0);
  });

  it("digital silence has no loudness and no peak (never a made-up number)", () => {
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [new Float32Array(FS * 2)] });
    expect(r).toMatchObject({ integrated_lufs: null, true_peak_dbtp: null, sample_peak_dbfs: null });
  });

  it("true peak finds inter-sample peaks the sample peak misses", () => {
    // fs/4 sine sampled at 45° phase: samples reach 0.707, the waveform reaches 1.0.
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [sine(FS / 4, 1, 1, Math.PI / 4)] });
    expect(r.sample_peak_dbfs!).toBeCloseTo(-3.01, 1);
    expect(r.true_peak_dbtp!).toBeGreaterThan(-0.5);
    expect(r.true_peak_dbtp!).toBeLessThan(0.3);
  });

  it("loudness range reflects level changes (EBU Tech 3342)", () => {
    const loud = sine(997, 0.5, 10), quiet = sine(997, 0.05, 10);
    const x = new Float32Array(loud.length + quiet.length);
    x.set(loud, 0);
    x.set(quiet, loud.length);
    const r = loudnessMeterEngine({ sample_rate: FS, channels: [x] });
    expect(r.lra_lu!).toBeGreaterThan(15);
    expect(r.lra_lu!).toBeLessThan(21);
    const steady = loudnessMeterEngine({ sample_rate: FS, channels: [sine(997, 0.5, 20)] });
    expect(steady.lra_lu!).toBeLessThan(0.5);
  });

  it("works at 44.1 kHz too", () => {
    const x = new Float32Array(44100 * 10);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 997 * i) / 44100);
    expect(loudnessMeterEngine({ sample_rate: 44100, channels: [x] }).integrated_lufs!).toBeCloseTo(-3.01, 1);
  });
});
