// activityFeedEngine (SRS §15 Collaboration): turns the project's immutable audit trail
// into readable lines. It only describes what the event itself records — no guessing.
import { ActivityFeedInputSchema, type ActivityEvent, type ActivityFeedInput } from "./input.schema";
import type { ActivityFeedOutput } from "./output.schema";
import { ENGINE_VERSION } from "./version";

const MODULE_LABELS: Record<string, string> = {
  script: "Scriptwriter", casting: "Casting & Characters", dialogue: "Dialogue Intelligence", scene_dna: "Scene DNA",
  shots: "Storyboard & Shots", generation: "Visual Generation", audio: "Audio Studio", editorial: "Editorial & Timeline",
  delivery: "Export & Deliver", assets: "Assets Library", settings: "Project Settings", team: "Team & Collaboration",
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Splits "ShotPlanApproved" -> "shot plan approved" for events without a dedicated sentence. */
function fallback(action: string) {
  return action.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase();
}

export function describeActivity(e: ActivityEvent): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  const where = str(m.module) ? ` in ${MODULE_LABELS[m.module as string] ?? m.module}` : "";
  const role = str(m.project_role) ?? str(m.role);
  switch (e.action) {
    case "ProjectCreated": return "created the project";
    case "ProjectUpdated": return "updated the project settings";
    case "CommentAdded": return `commented${where}${m.anchor && str((m.anchor as Record<string, unknown>).timecode) ? ` at ${(m.anchor as Record<string, string>).timecode}` : ""}`;
    case "CommentReplied": return `replied to a comment${where}`;
    case "CommentResolved": return `resolved a comment thread${where}`;
    case "CommentReopened": return `reopened a comment thread${where}`;
    case "CommentEdited": return `edited a comment${where}`;
    case "CommentDeleted": return `deleted a comment${where}`;
    case "TaskCreated": return `created a task${where}: “${str(m.title) ?? "untitled"}”`;
    case "ReviewRequested": return `asked for a review${where}: “${str(m.title) ?? "untitled"}”`;
    case "TaskStatusChanged": return `marked “${str(m.title) ?? "a task"}” as ${String(m.status ?? "changed").replace("_", " ")}`;
    case "InviteCreated": return `invited someone${role ? ` as ${role.replace(/_/g, " ")}` : ""}`;
    case "InviteRevoked": return "cancelled an invite";
    case "InviteAccepted": return `joined the project${role ? ` as ${role.replace(/_/g, " ")}` : ""}`;
    case "ProjectMemberAdded": return `added someone to the team${role ? ` as ${role.replace(/_/g, " ")}` : ""}`;
    case "ProjectMemberChanged": return `changed someone's role${role ? ` to ${role.replace(/_/g, " ")}` : ""}`;
    case "ProjectMemberRemoved": return "removed someone from the project";
    case "ScriptVersionSaved": return "saved a new script version";
    case "ScriptApproved": return "approved the script";
    case "PictureLocked": return "locked the picture";
    case "RenderRequested": return `started a render${str(m.profile_id) ? ` (${(m.profile_id as string).replace(/_/g, " ")})` : ""}`;
    case "RenderCompleted": return m.qc_passed === false ? "finished a render — QC failed" : "finished a render — QC passed";
    case "UpstreamVersionChanged": return `flagged work for review after an upstream change${str(m.reason) ? `: ${m.reason}` : ""}`;
    default: return fallback(e.action);
  }
}

export function activityFeedEngine(input: ActivityFeedInput): ActivityFeedOutput {
  const { events } = ActivityFeedInputSchema.parse(input);
  return {
    engine_version: ENGINE_VERSION,
    items: events.map((e) => ({
      id: e.id, action: e.action, summary: describeActivity(e), object_type: e.object_type, object_id: e.object_id,
      actor_email: e.actor_email, created_at: e.created_at,
    })),
  };
}
