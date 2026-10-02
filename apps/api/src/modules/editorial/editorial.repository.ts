// apps/api/src/modules/editorial/editorial.repository.ts
// Canonical persistence for Editorial. Reads Scriptwriter (scenes), Storyboard
// (shot plans + approved versions), Visual Generation (takes) and Audio Studio
// (sessions + approved versions) read-only; writes only via migration-0017 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { EditorialConflictError, EditorialLockedError, EditorialNotFoundError, EditorialNotReadyError, EditorialValidationError } from "./editorial.validator";
import { EditorialForbiddenError } from "./editorial.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

type Row = Record<string, any>;
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-EDT-\d+:\s*/, "");
  if (msg.startsWith("AURA-EDT-409")) return new EditorialConflictError(text);
  if (msg.startsWith("AURA-EDT-412")) return new EditorialNotReadyError(text);
  if (msg.startsWith("AURA-EDT-423")) return new EditorialLockedError(text, []);
  if (msg.startsWith("AURA-EDT-404")) return new EditorialNotFoundError(text);
  if (msg.startsWith("AURA-EDT-403") || error.code === "42501") return new EditorialForbiddenError(colForbiddenMessage(error));
  if (msg.startsWith("AURA-EDT-400")) return new EditorialValidationError([], text);
  if (error.code === "23503") return new EditorialValidationError([], "A clip refers to a take or mix that doesn't exist in this project");
  if (error.code === "23514") return new EditorialValidationError([], "A clip runs past the end of its media");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rows(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Row[];
}
async function rpc<T = Row>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

export const listScenes = (db: SupabaseClient, p: string) =>
  rows(db.from("scenes").select("id, number, heading, status").eq("project_id", p).order("number", { ascending: true }));
export const listPlans = (db: SupabaseClient, p: string) => rows(db.from("shot_plans").select("id, scene_id, status, review_state, review_reason, approved_version_id").eq("project_id", p));
export const listPlanVersions = (db: SupabaseClient, p: string) => rows(db.from("shot_plan_versions").select("id, plan_id, version_number, shots").eq("project_id", p));
export const listTakes = (db: SupabaseClient, p: string) =>
  rows(db.from("takes").select("id, scene_id, shot_id, take_number, capability, params, status, approval, storage_key, media_type").eq("project_id", p));
export const listSessions = (db: SupabaseClient, p: string) =>
  rows(db.from("audio_sessions").select("id, scene_id, status, review_state, review_reason, approved_version_id, scene_seconds").eq("project_id", p));
/** Audio Studio's live clips and tracks (read-only; Audio Studio owns them) — sound cues shown on the picture timeline. */
export const listAudioClips = (db: SupabaseClient, p: string) =>
  rows(db.from("audio_clips").select("id, session_id, track_id, label, kind, asset_id, start_seconds, duration_seconds").eq("project_id", p));
export const listAudioTracks = (db: SupabaseClient, p: string) =>
  rows(db.from("audio_tracks").select("id, session_id, family, name").eq("project_id", p));
export const listMixVersions = (db: SupabaseClient, p: string) =>
  rows(db.from("audio_session_versions").select("id, session_id, version_number, tracks, clips, measurement, mix").eq("project_id", p));
/** An audio file from this project's Assets Library (read-only; the Assets Library owns it), for the music track. */
export async function getAudioAsset(db: SupabaseClient, p: string, id: string) {
  const { data, error } = await db.from("assets").select("id, name, type, metadata, archived_at").eq("project_id", p).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

/** Audio files the music track can use (the Assets Library's own records, read-only). */
export const listAudioAssets = (db: SupabaseClient, p: string) =>
  rows(db.from("assets").select("id, name, category, metadata").eq("project_id", p).eq("type", "audio").is("archived_at", null).order("name", { ascending: true }));

export async function getTimeline(db: SupabaseClient, p: string) {
  const { data, error } = await db.from("timelines").select("*").eq("project_id", p).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}
export const listClips = (db: SupabaseClient, timelineId: string) =>
  rows(db.from("timeline_clips").select("*").eq("timeline_id", timelineId).order("record_in", { ascending: true }));
export const listVersions = (db: SupabaseClient, timelineId: string) =>
  rows(db.from("timeline_versions").select("id, version_number, label, kind, duration_frames, created_at").eq("timeline_id", timelineId).order("version_number", { ascending: false }));
export async function getVersion(db: SupabaseClient, timelineId: string, versionId: string) {
  const { data, error } = await db.from("timeline_versions").select("*").eq("timeline_id", timelineId).eq("id", versionId).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}
export const listLocks = (db: SupabaseClient, timelineId: string) =>
  rows(db.from("picture_locks").select("*").eq("timeline_id", timelineId).order("lock_number", { ascending: false }));

export const saveAutomation = (db: SupabaseClient, p: string, automation: unknown, baseRevision: string) =>
  rpc<Row>(db, "save_timeline_automation", { p_project_id: p, p_automation: automation, p_base_revision: baseRevision });
export const saveTimeline = (db: SupabaseClient, a: { projectId: string; baseRevision: string | null; clips: unknown[]; action: string; summary: string; engineVersion: string; breakLock: boolean; impact: unknown }) =>
  rpc(db, "save_timeline", {
    p_project_id: a.projectId, p_base_revision: a.baseRevision, p_clips: a.clips, p_action: a.action, p_summary: a.summary,
    p_engine_version: a.engineVersion, p_break_lock: a.breakLock, p_impact: a.impact,
  });
/** The newest edit Undo can take back on this revision (migration 0054), or null. */
export async function getUndoHead(db: SupabaseClient, timelineId: string, revision: string) {
  const { data, error } = await db.from("timeline_undo").select("action, summary, created_at").eq("timeline_id", timelineId).eq("after_revision", revision)
    .is("undone_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}
export const undoTimeline = (db: SupabaseClient, projectId: string, baseRevision: string, breakLock: boolean) =>
  rpc<Row>(db, "undo_timeline", { p_project_id: projectId, p_base_revision: baseRevision, p_break_lock: breakLock });
export const saveVersion = (db: SupabaseClient, projectId: string, label: string, kind: "manual" | "auto", qc: unknown) =>
  rpc(db, "save_timeline_version", { p_project_id: projectId, p_label: label, p_kind: kind, p_qc: qc });
export const lockPicture = (db: SupabaseClient, projectId: string, baseRevision: string, qc: unknown) =>
  rpc(db, "lock_picture", { p_project_id: projectId, p_base_revision: baseRevision, p_qc: qc });
export const setReview = (db: SupabaseClient, projectId: string, state: string, reason: string | null) =>
  rpc(db, "set_timeline_review", { p_project_id: projectId, p_state: state, p_reason: reason });
