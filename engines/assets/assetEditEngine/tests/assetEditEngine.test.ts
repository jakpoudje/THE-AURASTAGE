import { describe, expect, it } from "vitest";
import { applyAudioEdit, encodeWav16, planImageEdit } from "../engine";

const tone = (seconds: number, sr = 1000, amp = 0.5) => Float32Array.from({ length: seconds * sr }, () => amp);

describe("assetEditEngine — audio", () => {
  it("trims, applies gain and fades, and describes the edit", () => {
    const r = applyAudioEdit({ sample_rate: 1000, channels: [tone(4)] }, { trim_start: 1, trim_end: 3, gain_db: 6, fade_in: 0.5 }, 2);
    expect(r.channels[0].length).toBe(2000);
    expect(r.duration).toBe(2);
    expect(r.channels[0][0]).toBe(0); // fade starts from silence
    expect(r.channels[0][1500]).toBeCloseTo(0.5 * 10 ** (6 / 20), 5);
    expect(r.note).toBe("Edited in AuraStage from v2: trimmed to 1–3 s, gain +6 dB, fade in 0.5 s");
  });
  it("normalises the peak and never clips silently", () => {
    const r = applyAudioEdit({ sample_rate: 1000, channels: [tone(1, 1000, 0.25)] }, { normalize_peak_db: -1 });
    expect(r.peak_db_after).toBeCloseTo(-1, 2);
    const loud = applyAudioEdit({ sample_rate: 1000, channels: [tone(1, 1000, 0.9)] }, { gain_db: 12 });
    expect(loud.clipped_samples).toBe(1000);
    expect(Math.max(...loud.channels[0])).toBe(1);
  });
  it("refuses a clip trimmed to nothing and bad values", () => {
    expect(() => applyAudioEdit({ sample_rate: 1000, channels: [tone(1)] }, { trim_start: 2 })).toThrow(/at least 10 ms/);
    expect(() => applyAudioEdit({ sample_rate: 1000, channels: [tone(1)] }, { gain_db: 60 })).toThrow();
  });
  it("encodes a valid 16-bit WAV", () => {
    const b = encodeWav16(48000, [tone(1, 48000), tone(1, 48000)]);
    expect(new TextDecoder().decode(b.slice(0, 4))).toBe("RIFF");
    expect(b.length).toBe(44 + 48000 * 2 * 2);
  });
});

describe("assetEditEngine — image", () => {
  it("crops, rotates and resizes; rotation swaps the sides", () => {
    const p = planImageEdit(2000, 1000, { crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, rotate: 90, max_size: 500 }, 1);
    expect(p.source).toEqual({ x: 500, y: 0, w: 1000, h: 1000 });
    expect([p.width, p.height]).toEqual([500, 500]);
    expect(p.note).toBe("Edited in AuraStage from v1: cropped to 1000×1000, rotated 90°, resized to fit 500 px");
  });
  it("builds the colour filter only for changed values", () => {
    expect(planImageEdit(10, 10, {}).filter).toBe("none");
    expect(planImageEdit(10, 10, { brightness: 120, saturation: 0 }).filter).toBe("brightness(120%) saturate(0%)");
  });
  it("refuses a crop outside the picture", () => {
    expect(() => planImageEdit(10, 10, { crop: { x: 0.5, y: 0, w: 0.8, h: 1 } })).toThrow(/inside the picture/);
  });
});
