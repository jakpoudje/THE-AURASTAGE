// apps/api/src/modules/rendering/rendering.repository.ts
// Canonical persistence for Export & Deliver. Reads Editorial (timelines, picture
// locks, locked versions), Visual Generation (takes), Audio Studio (approved mix
// versions), Assets (recordings) and Dialogue (lines) read-only; writes only via
// the migration-0018 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { RenderingConflictError, RenderingNotFoundError, RenderingNotReadyError, RenderingValidationError } from "./rendering.validator";
import { RenderingForbiddenError } from "./rendering.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

type Row = Record<string, any>;
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-EXP-\d+:\s*/, "");
  if (msg.startsWith("AURA-EXP-409")) return new RenderingConflictError(text);
  if (msg.startsWith("AURA-EXP-412")) return new RenderingNotReadyError(text);
  if (msg.startsWith("AURA-EXP-404")) return new RenderingNotFoundError(text);
  if (msg.startsWith("AURA-EXP-403") || error.code === "42501") return new RenderingForbiddenError(colForbiddenMessage(error));
  if (msg.startsWith("AURA-EXP-400")) return new RenderingValidationError([], text);
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rows(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Row[];
}
async function one(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row | null> {
  const { data, error } = await q;
  if (error) throw error;
  return (data as Row | null) ?? null;
}
async function rpc<T = Row>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}
const inList = (ids: string[]) => (ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

export const getTimeline = (db: SupabaseClient, p: string) => one(db.from("timelines").select("id, status, current_lock_id, fps, automation, automation_revision").eq("project_id", p).maybeSingle());
export const getLock = (db: SupabaseClient, id: string) => one(db.from("picture_locks").select("*").eq("id", id).maybeSingle());
export const getVersion = (db: SupabaseClient, id: string) => one(db.from("timeline_versions").select("*").eq("id", id).maybeSingle());
export const listScenes = (db: SupabaseClient, p: string) => rows(db.from("scenes").select("id, number, heading").eq("project_id", p));
export const listTakes = (db: SupabaseClient, ids: string[]) =>
  rows(db.from("takes").select("id, storage_key, media_type, capability, params, provider").in("id", inList(ids)));
export const listMixVersions = (db: SupabaseClient, ids: string[]) =>
  rows(db.from("audio_session_versions").select("id, session_id, version_number, tracks, clips, measurement, mix").in("id", inList(ids)));
export const listSessions = (db: SupabaseClient, p: string) => rows(db.from("audio_sessions").select("id, scene_id, scene_seconds, approved_version_id, status, review_state").eq("project_id", p));
export const listAssets = (db: SupabaseClient, ids: string[]) => rows(db.from("assets").select("id, storage_path, metadata").in("id", inList(ids)));
export const listLines = (db: SupabaseClient, ids: string[]) => rows(db.from("dialogue_lines").select("id, speaker_name, text").in("id", inList(ids)));
/** The cast for the end credits (read-only; Casting owns characters): leads first, merged duplicates left out. */
export const listCast = (db: SupabaseClient, p: string) =>
  rows(db.from("characters").select("name, role, kind").eq("project_id", p).is("merged_into", null).order("name", { ascending: true }));
/** On-screen text per scene (read-only; Scene DNA owns it, migration 0040). */
/** How intense each scene is, from its dialogue (Dialogue owns the lines; read-only) — for cut-downs and trailers. */
export const listSceneIntensity = (db: SupabaseClient, p: string) =>
  Promise.all([rows(db.from("scenes").select("id, number").eq("project_id", p)), rows(db.from("dialogue_lines").select("scene_id, intensity, emotion").eq("project_id", p))]);
export const listCaptions = (db: SupabaseClient, p: string) =>
  rows(db.from("scene_dna").select("scene_id, on_screen_text, on_screen_position").eq("project_id", p).not("on_screen_text", "is", null));
export const listRenders =(db: SupabaseClient, p: string) =>
  rows(db.from("renders").select("id, org_id, project_id, picture_lock_id, lock_number, profile_id, profile_version, options, manifest_sha256, status, progress, stage, error, outputs, qc, qc_passed, review_state, review_reason, created_at, started_at, completed_at, cancel_requested").eq("project_id", p).order("created_at", { ascending: false }));

export const createRender = (db: SupabaseClient, a: { projectId: string; lockId: string; profileId: string; profileVersion: string; options: unknown; manifest: unknown; sha256: string; engineVersion: string }) =>
  rpc(db, "create_render", {
    p_project_id: a.projectId, p_picture_lock_id: a.lockId, p_profile_id: a.profileId, p_profile_version: a.profileVersion,
    p_options: a.options, p_manifest: a.manifest, p_manifest_sha256: a.sha256, p_engine_version: a.engineVersion,
  });
export const cancelRender = (db: SupabaseClient, id: string) => rpc(db, "cancel_render", { p_render_id: id });
export const setReview = (db: SupabaseClient, id: string, state: string, reason: string | null) => rpc(db, "set_render_review", { p_render_id: id, p_state: state, p_reason: reason });
