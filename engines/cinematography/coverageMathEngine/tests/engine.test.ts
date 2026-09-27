import { describe, expect, it } from "vitest";
import { coverageMathEngine } from "../engine";

const shot = (id: string, a: number, b: number, lines: string[] = [], chars: string[] = []) => ({
  id, ordinal: Number(id), purpose: "dialogue" as const, duration_seconds: b - a, story_start: a, story_end: b, character_ids: chars, dialogue_line_ids: lines,
});

describe("coverageMathEngine", () => {
  it("measures the union of story intervals, not the sum of durations (SRS §9.1)", () => {
    const r = coverageMathEngine({ scene_seconds: 10, shots: [shot("1", 0, 10), shot("2", 2, 6), shot("3", 4, 8)], line_ids: [], characters: [] });
    expect(r.coverage).toBe(1);
    expect(r.screen_seconds).toBe(18);
  });

  it("reports gaps and blocks approval below 95%", () => {
    const r = coverageMathEngine({ scene_seconds: 10, shots: [shot("1", 0, 4), shot("2", 6, 10)], line_ids: [], characters: [] });
    expect(r.coverage).toBe(0.8);
    expect(r.gaps).toEqual([{ start: 4, end: 6 }]);
    expect(r.ready_for_approval).toBe(false);
    expect(r.readiness.find((p) => p.id === "story_time_covered")!.evidence).toMatch(/gaps 4–6s/);
  });

  it("treats every dialogue line as a mandatory beat", () => {
    const r = coverageMathEngine({ scene_seconds: 5, shots: [shot("1", 0, 5, ["a"])], line_ids: ["a", "b"], line_labels: { b: "AMARA: Run!" }, characters: [] });
    expect(r.uncovered_lines).toEqual(["b"]);
    expect(r.readiness.find((p) => p.id === "dialogue_covered")).toMatchObject({ ok: false, evidence: "Not covered: AMARA: Run!" });
    expect(r.ready_for_approval).toBe(false);
  });

  it("flags characters never in frame (recommended, not blocking)", () => {
    const r = coverageMathEngine({ scene_seconds: 5, shots: [shot("1", 0, 5, [], ["t"])], line_ids: [], characters: [{ id: "t", name: "Tunde" }, { id: "a", name: "Amara" }] });
    expect(r.unseen_characters).toEqual(["Amara"]);
    expect(r.ready_for_approval).toBe(true);
  });

  it("clamps intervals to the scene and ignores tiny rounding gaps", () => {
    const r = coverageMathEngine({ scene_seconds: 10, shots: [shot("1", 0, 5.02), shot("2", 5.05, 14)], line_ids: [], characters: [] });
    expect(r.coverage).toBe(1);
    expect(r.gaps).toEqual([]);
  });
});
