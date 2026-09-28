import { describe, expect, it } from "vitest";
import { productionOverviewEngine } from "../engine";

const P = "11111111-1111-4111-8111-111111111111";
const empty = {
  script: { has_draft: false, approved_version: null, scenes: 0 },
  casting: { characters: 0, approved: 0, pending_candidates: 0, sync: "no_script" as const },
  dialogue: { scenes_with_lines: 0, scenes_approved: 0, lines: 0, review_required: 0, sync: "no_script" as const },
  scene_dna: { scenes: 0, locked: 0, needs_review: 0 },
  storyboard: { locked_scenes: 0, planned: 0, approved: 0, shots: 0, needs_review: 0 },
  visual: { shots: 0, with_approved_take: 0, needs_review: 0, running: 0 },
  audio: { scenes: 0, approved: 0, needs_review: 0 },
  editorial: { timeline: false, locked: false, lock_number: null, review_required: false, offline: 0, issues: 0 },
  delivery: { picture_lock: false, required: 0, required_done: 0, delivered: 0, failed: 0, out_of_date: 0 },
};

describe("productionOverviewEngine", () => {
  it("a new project: nothing is invented — later stages wait, the next step is the script", () => {
    const o = productionOverviewEngine({ project_id: P, facts: empty });
    expect(o.stages.map((s) => s.state)).toEqual(["not_started", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting"]);
    expect(o.stages.slice(1).every((s) => s.done === null && s.total === null)).toBe(true);
    expect(o.next).toEqual({ stage: "scriptwriter", label: "Scriptwriter: Write or import the script", href: `/projects/${P}/scriptwriter` });
    expect(o.complete).toBe(0);
    expect(o.engine_version).toBe("1.0.0");
  });

  it("mid-production: real counts per stage, flagged stages listed for attention", () => {
    const o = productionOverviewEngine({ project_id: P, facts: {
      ...empty,
      script: { has_draft: true, approved_version: 3, scenes: 5 },
      casting: { characters: 4, approved: 4, pending_candidates: 0, sync: "current" },
      dialogue: { scenes_with_lines: 4, scenes_approved: 4, lines: 40, review_required: 0, sync: "current" },
      scene_dna: { scenes: 5, locked: 3, needs_review: 1 },
      storyboard: { locked_scenes: 3, planned: 2, approved: 1, shots: 9, needs_review: 0 },
      visual: { shots: 4, with_approved_take: 2, needs_review: 0, running: 1 },
    } });
    const by = Object.fromEntries(o.stages.map((s) => [s.id, s]));
    expect([by.scriptwriter.state, by.casting.state, by.dialogue.state]).toEqual(["complete", "complete", "complete"]);
    expect(by["scene-dna"]).toMatchObject({ state: "needs_review", done: 3, total: 5, next_step: "Review and re-lock the flagged scenes" });
    expect(by.storyboard).toMatchObject({ state: "in_progress", done: 1, total: 3, next_step: "Plan shots for the locked scenes" });
    expect(by.visual.summary).toBe("2 of 4 planned shots have an approved take · 1 generating");
    expect(by.editorial).toMatchObject({ state: "not_started", next_step: "Build the first assembly" });
    expect(o.attention).toEqual([{ stage: "scene-dna", label: "Scene DNA: Review and re-lock the flagged scenes", href: `/projects/${P}/scene-dna` }]);
    expect(o.next!.stage).toBe("scene-dna");
    expect(o.complete).toBe(3);
  });

  it("delivery: required deliverables drive completion; out-of-date renders need review", () => {
    const base = { ...empty, editorial: { timeline: true, locked: true, lock_number: 2, review_required: false, offline: 0, issues: 0 } };
    let o = productionOverviewEngine({ project_id: P, facts: { ...base, delivery: { picture_lock: true, required: 2, required_done: 1, delivered: 3, failed: 0, out_of_date: 0 } } });
    expect(o.stages[8]).toMatchObject({ state: "in_progress", done: 1, total: 2, next_step: "Render the required deliverables" });
    expect(o.stages[7]).toMatchObject({ state: "complete", summary: "Picture Lock 2" });
    o = productionOverviewEngine({ project_id: P, facts: { ...base, delivery: { picture_lock: true, required: 2, required_done: 2, delivered: 2, failed: 0, out_of_date: 1 } } });
    expect(o.stages[8].state).toBe("needs_review");
    o = productionOverviewEngine({ project_id: P, facts: { ...base, delivery: { picture_lock: true, required: 0, required_done: 0, delivered: 0, failed: 0, out_of_date: 0 } } });
    expect(o.stages[8]).toMatchObject({ state: "not_started", total: null });
  });

  it("rejects facts that aren't counts", () => {
    expect(() => productionOverviewEngine({ project_id: P, facts: { ...empty, audio: { scenes: -1, approved: 0, needs_review: 0 } } })).toThrow();
  });
});
