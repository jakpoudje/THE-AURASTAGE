import { describe, expect, it } from "vitest";
import { supportDiagnosticEngine } from "../engine";

describe("supportDiagnosticEngine", () => {
  it("summarises failures, stuck jobs and review flags, problems first", () => {
    const r = supportDiagnosticEngine({
      failed_jobs: [{ engine_id: "rendering.render", code: "AURA-EXP-500", at: "2026-09-28T10:00:00Z" }, { engine_id: "rendering.render", code: null, at: "2026-09-28T11:00:00Z" }],
      stuck_jobs: [{ engine_id: "generation.take", minutes: 42 }],
      review_required: { shot_plans: 2, renders: 0 },
      picture_locked: false,
    });
    expect(r.findings.map((f) => `${f.severity}:${f.message}`)).toEqual([
      "problem:2 renders failed in the last 7 days",
      "warning:A generation job has been waiting 42 min",
      "warning:2 shot plan(s) marked for review",
      "info:The picture isn't locked yet — deliverables need a Picture Lock",
    ]);
    expect(r.findings[0].evidence).toContain("AURA-EXP-500");
  });
  it("reports nothing when there's nothing to report", () => {
    expect(supportDiagnosticEngine({}).findings).toEqual([]);
  });
});
