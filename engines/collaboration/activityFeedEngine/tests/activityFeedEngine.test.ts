import { describe, expect, it } from "vitest";
import { activityFeedEngine } from "../engine";

const ev = (action: string, metadata: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", action, object_type: "X", object_id: null, metadata, actor_email: "a@aurastage.invalid", created_at: "2026-09-28T00:00:00Z",
});

describe("activityFeedEngine", () => {
  it("describes collaboration events from what they record", () => {
    const { items, engine_version } = activityFeedEngine({ events: [
      ev("CommentAdded", { module: "editorial", anchor: { timecode: "00:00:02:00" } }),
      ev("ReviewRequested", { module: "script", title: "Review scene 2" }),
      ev("TaskStatusChanged", { status: "in_progress", title: "Trim" }),
      ev("InviteAccepted", { project_role: "script_editor" }),
      ev("RenderCompleted", { qc_passed: false }),
    ] });
    expect(items.map((i) => i.summary)).toEqual([
      "commented in Editorial & Timeline at 00:00:02:00",
      "asked for a review in Scriptwriter: “Review scene 2”",
      "marked “Trim” as in progress",
      "joined the project as script editor",
      "finished a render — QC failed",
    ]);
    expect(engine_version).toBe("1.0.0");
  });
  it("falls back to the event name for anything else, never inventing detail", () => {
    expect(activityFeedEngine({ events: [ev("ShotPlanApproved"), ev("SceneDNAVersionLocked", null as never)] }).items.map((i) => i.summary))
      .toEqual(["shot plan approved", "scene dna version locked"]);
  });
});
