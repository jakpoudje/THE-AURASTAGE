import { describe, expect, it } from "vitest";
import { duckUnderDialogue, loudnessCorrection, mergeRegions } from "../engine";

describe("mixAssistEngine", () => {
  it("ducks under dialogue, merging lines closer than a second so the music doesn't pump", () => {
    const r = duckUnderDialogue({ dialogue: [{ start: 2, end: 4 }, { start: 4.5, end: 6 }, { start: 10, end: 12 }], scene_seconds: 20 });
    expect(r.regions).toEqual([{ start: 2, end: 6 }, { start: 10, end: 12 }]);
    expect(r.automation).toEqual([
      { t: 1.75, db: 0 }, { t: 2, db: -10 }, { t: 6, db: -10 }, { t: 6.6, db: 0 },
      { t: 9.75, db: 0 }, { t: 10, db: -10 }, { t: 12, db: -10 }, { t: 12.6, db: 0 },
    ]);
    expect(r.summary).toMatch(/Dips 10 dB under 2 stretches/);
    expect(duckUnderDialogue({ dialogue: [], scene_seconds: 5 }).automation).toEqual([]);
    expect(duckUnderDialogue({ dialogue: [{ start: 0, end: 5 }], scene_seconds: 5 }).automation[0]).toEqual({ t: 0, db: -10 });
    expect(mergeRegions([{ start: 3, end: 2 }], 1)).toEqual([]);
  });
  it("moves the measured loudness onto the target and says what happens to the peaks", () => {
    const up = loudnessCorrection({ measured_lufs: -29.4, true_peak_dbtp: -8, target_lufs: -23, max_true_peak_dbtp: -1, current_master_db: 0, limiter: true, ceiling_db: -1 });
    expect(up.change_db).toBe(6.4);
    expect(up.predicted_true_peak_dbtp).toBe(-1.6);
    expect(up.over_peak_limit).toBe(false);
    const hot = loudnessCorrection({ measured_lufs: -30, true_peak_dbtp: -3, target_lufs: -23, max_true_peak_dbtp: -1, current_master_db: 0, limiter: false, ceiling_db: -1 });
    expect(hot.over_peak_limit).toBe(true);
    expect(hot.note).toMatch(/switch the master limiter on/);
    expect(loudnessCorrection({ measured_lufs: -23, true_peak_dbtp: -5, target_lufs: -23, max_true_peak_dbtp: -1, current_master_db: 2, limiter: true, ceiling_db: -1 }).note).toBe("Already on target.");
  });
});
