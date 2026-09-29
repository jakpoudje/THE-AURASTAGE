// apps/api/src/modules/audio/audio.repository.ts
// Canonical persistence for the Audio Studio. Reads Scriptwriter (scenes),
// Storyboard (shot plans + approved versions), Scene DNA (locked versions),
// Dialogue (lines), Casting (names) and Assets (audio) read-only; writes only
// via the migration-0015 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AudioBusyError, AudioConflictError, AudioNotFoundError, AudioNotReadyError, AudioValidationError } from "./audio.validator";
import { AudioForbiddenError } from "./audio.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

type Row = Record<string, any>;
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-AUD-\d+:\s*/, "");
  if (msg.startsWith("AURA-AUD-409")) return new AudioConflictError(text);
  if (msg.startsWith("AURA-AUD-429")) return new AudioBusyError(text);
  if (msg.startsWith("AURA-AUD-412")) return new AudioNotReadyError(text);
  if (msg.startsWith("AURA-AUD-404")) return new AudioNotFoundError(text);
  if (msg.startsWith("AURA-AUD-403") || error.code === "42501") return new AudioForbiddenError(colForbiddenMessage(error));
  if (msg.startsWith("AURA-AUD-400") || error.code === "23514") return new AudioValidationError([], text || "That value isn't allowed");
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
  rows(db.from("scenes").select("id, number, heading, int_ext, location, time_of_day, status, element_start, element_end").eq("project_id", p).order("number", { ascending: true }));
export const listPlans = (db: SupabaseClient, p: string) => rows(db.from("shot_plans").select("id, scene_id, status, review_state, review_reason, approved_version_id").eq("project_id", p));
export const listPlanVersions = (db: SupabaseClient, p: string) => rows(db.from("shot_plan_versions").select("id, plan_id, version_number, scene_dna_version_id, shots").eq("project_id", p));
export const listDnaVersions = (db: SupabaseClient, p: string) => rows(db.from("scene_dna_versions").select("id, content").eq("project_id", p));
export const listLines = (db: SupabaseClient, p: string) =>
  rows(db.from("dialogue_lines").select("id, speaker_name, character_id, text, estimated_seconds, extensions, element_index, source_version_id").eq("project_id", p));
/** Source line of each element of a script version (read-only; Scriptwriter owns it) — to place sound cues by script position. */
export async function scriptElementLines(db: SupabaseClient, versionId: string): Promise<Map<number, number>> {
  const { data, error } = await db.from("script_versions").select("elements").eq("id", versionId).maybeSingle();
  if (error) throw error;
  return new Map(((data?.elements ?? []) as { index: number; line: number }[]).map((e) => [e.index, e.line]));
}
export const listCharacters = (db: SupabaseClient, p: string) => rows(db.from("characters").select("id, name").eq("project_id", p));
export const listSessions = (db: SupabaseClient, p: string) => rows(db.from("audio_sessions").select("*").eq("project_id", p));
export const listTracks = (db: SupabaseClient, p: string) => rows(db.from("audio_tracks").select("*").eq("project_id", p).order("ordinal", { ascending: true }));
export const listClips = (db: SupabaseClient, p: string) => rows(db.from("audio_clips").select("*").eq("project_id", p).order("start_seconds", { ascending: true }));
export const listMeasurements = (db: SupabaseClient, p: string) =>
  rows(db.from("audio_measurements").select("*").eq("project_id", p).order("measured_at", { ascending: false }));
export const listVersions = (db: SupabaseClient, p: string) => rows(db.from("audio_session_versions").select("id, session_id, version_number, created_at").eq("project_id", p));
/** Read-only view of the Assets Library: when each recording last got a new version (migration 0024). */
export const listAssetVersionTimes = (db: SupabaseClient, p: string) =>
  rows(db.from("assets").select("id, name, current_version, version_updated_at").eq("project_id", p).eq("type", "audio"));
export const listAudioAssets = (db: SupabaseClient, p: string) =>
  rows(db.from("assets").select("id, name, metadata, created_at").eq("project_id", p).eq("type", "audio").order("created_at", { ascending: false }));

export const spot = (db: SupabaseClient, a: { projectId: string; sceneId: string; planVersionId: string; seconds: number; tracks: unknown; clips: unknown; engineVersion: string }) =>
  rpc(db, "spot_audio_session", {
    p_project_id: a.projectId, p_scene_id: a.sceneId, p_shot_plan_version_id: a.planVersionId, p_scene_seconds: a.seconds, p_tracks: a.tracks, p_clips: a.clips, p_engine_version: a.engineVersion,
  });
export const addTrack = (db: SupabaseClient, sessionId: string, a: { name: string; family: string; after_track_id?: string }) =>
  rpc(db, "add_audio_track", { p_session_id: sessionId, p_name: a.name, p_family: a.family, p_after: a.after_track_id ?? null });
export const moveTrack = (db: SupabaseClient, id: string, direction: number) => rpc(db, "move_audio_track", { p_track_id: id, p_direction: direction });
export const deleteTrack = (db: SupabaseClient, id: string) => rpc(db, "delete_audio_track", { p_track_id: id });
export const updateTrack = (db: SupabaseClient, id: string, patch: Row) => rpc(db, "update_audio_track", { p_track_id: id, p_patch: patch });
export const updateMix = (db: SupabaseClient, sessionId: string, mix: Row, revision: string) => rpc(db, "update_audio_mix", { p_session_id: sessionId, p_mix: mix, p_revision: revision });
export const saveClip = (db: SupabaseClient, sessionId: string, clipId: string | null, patch: Row) => rpc(db, "save_audio_clip", { p_session_id: sessionId, p_clip_id: clipId, p_patch: patch });
export const deleteClip = (db: SupabaseClient, id: string) => rpc(db, "delete_audio_clip", { p_clip_id: id });
export const recordMeasurement = (db: SupabaseClient, sessionId: string, m: Row) => rpc(db, "record_audio_measurement", { p_session_id: sessionId, p_m: m });
export const approve = (db: SupabaseClient, projectId: string, sceneId: string) => rpc(db, "approve_audio_session", { p_project_id: projectId, p_scene_id: sceneId });
export const setReview = (db: SupabaseClient, id: string, state: string, reason: string | null) => rpc(db, "set_audio_review", { p_session_id: id, p_state: state, p_reason: reason });

// ---- Generation (migration 0026): requests only; the worker makes the file and the Assets domain registers it ----
export const listGenerations = (db: SupabaseClient, p: string) =>
  rows(db.from("audio_generations").select("id, scene_id, clip_id, kind, description, duration_seconds, provider, model, execution, seed, status, asset_id, result, error, created_at, completed_at")
    .eq("project_id", p).order("created_at", { ascending: false }).limit(300));
export const requestGeneration = (db: SupabaseClient, a: { project: string; scene: string; clip: string | null; kind: string; description: string; duration: number; mood: string[];
  provider: string; model: string; execution: string; seed: number; engineVersion: string; params?: Record<string, unknown> }) =>
  rpc<Row>(db, "request_audio_generation", { p_project: a.project, p_scene: a.scene, p_clip: a.clip, p_kind: a.kind, p_description: a.description, p_duration: a.duration,
    p_mood: a.mood, p_provider: a.provider, p_model: a.model, p_execution: a.execution, p_seed: a.seed, p_params: a.params ?? {}, p_engine_version: a.engineVersion });
// Read-only: the dialogue line and its speaker's Casting profile, for Voice DNA.
export async function getLineWithSpeaker(db: SupabaseClient, lineId: string) {
  const { data: l, error } = await db.from("dialogue_lines").select("id, scene_id, project_id, text, speaker_name, character_id, emotion, intensity, estimated_seconds").eq("id", lineId).maybeSingle();
  if (error) throw mapDbError(error);
  if (!l) return null;
  const c = (l as Row).character_id
    ? ((await db.from("characters").select("id, name, age, gender, nationality, personality, description").eq("id", (l as Row).character_id).maybeSingle()).data as Row | null)
    : null;
  return { line: l as Row, character: c };
}
