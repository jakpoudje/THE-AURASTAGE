import { describe, expect, it } from "vitest";
import { deliveryProfile } from "../../deliveryProfileEngine";
import { finalQCEngine } from "../engine";

const SHA = "a".repeat(64);
const mp4 = (over: Record<string, unknown> = {}) => ({
  name: "streaming_1080p24.mp4", bytes: 1000, sha256: SHA,
  video: { codec: "h264", width: 1920, height: 1080, fps: 24, pix_fmt: "yuv420p", duration: 4 },
  audio: { codec: "aac", sample_rate: 48000, channels: 2, duration: 4.01 },
  loudness: { integrated_lufs: -23.4, true_peak_dbtp: -2, lra_lu: 3 }, cues: null, ...over,
});
const srt = { name: "captions.srt", bytes: 50, sha256: SHA, video: null, audio: null, loudness: null, cues: 2 };
const run = (files: unknown[], over: Record<string, unknown> = {}) =>
  finalQCEngine({ profile: deliveryProfile("streaming_master"), fps: 24, duration_frames: 96, expected_files: ["streaming_1080p24.mp4", "captions.srt"], expected_cues: 2, files, ...over });

describe("finalQCEngine", () => {
  it("passes a compliant package", () => {
    const r = run([mp4(), srt]);
    expect(r.passed).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });
  it("fails on wrong format, frame rate or duration, with the file named", () => {
    const r = run([mp4({ video: { codec: "h264", width: 1280, height: 720, fps: 25, pix_fmt: "yuv420p", duration: 3 } }), srt]);
    expect(r.passed).toBe(false);
    const bad = r.checks.filter((c) => !c.ok).map((c) => c.id.split(":")[0]);
    expect(bad).toEqual(["video_format", "frame_rate", "video_duration"]);
    expect(r.checks.find((c) => !c.ok)!.file).toBe("streaming_1080p24.mp4");
  });
  it("fails on missing files, missing checksums and lost subtitle cues", () => {
    expect(run([mp4()]).checks.find((c) => c.id === "package_complete")!.evidence).toMatch(/captions\.srt/);
    expect(run([mp4({ sha256: null }), srt]).passed).toBe(false);
    expect(run([mp4(), { ...srt, cues: 1 }]).passed).toBe(false);
  });
  it("loudness outside R128 is reported but advisory", () => {
    const r = run([mp4({ loudness: { integrated_lufs: -30, true_peak_dbtp: 0.5, lra_lu: 3 } }), srt]);
    expect(r.passed).toBe(true);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id.split(":")[0])).toEqual(["loudness", "true_peak"]);
  });
  it("audio package: WAV format and duration per file", () => {
    const wav = (name: string, over = {}) => ({ name, bytes: 10, sha256: SHA, video: null, audio: { codec: "pcm_s24le", sample_rate: 48000, channels: 2, duration: 4 }, loudness: null, cues: null, ...over });
    const r = finalQCEngine({ profile: deliveryProfile("audio_package"), fps: 24, duration_frames: 96, expected_files: ["mix.wav", "ME.wav"], expected_cues: null, files: [wav("mix.wav"), wav("ME.wav", { audio: { codec: "pcm_s16le", sample_rate: 44100, channels: 2, duration: 4 } })] });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => !c.ok)!.file).toBe("ME.wav");
  });
});
