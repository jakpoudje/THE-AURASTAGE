// apps/api/src/modules/shots/shots.repository.ts
// Canonical persistence for Shot / ShotPlan. Reads Scriptwriter (scenes), Scene DNA
// (scene_dna, scene_dna_versions), Dialogue (dialogue_lines) and Casting
// (characters) read-only; writes only via the migration-0012 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ShotConflictError, ShotNotFoundError, ShotNotReadyError, ShotValidationError } from "./shots.validator";
import { ShotForbiddenError } from "./shots.permissions";

type Row = Record<string, any>;

function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-SHOT-\d+:\s*/, "");
  if (msg.startsWith("AURA-SHOT-409")) return new ShotConflictError(text);
  if (msg.startsWith("AURA-SHOT-412")) return new ShotNotReadyError(text);
  if (msg.startsWith("AURA-SHOT-404")) return new ShotNotFoundError(text);
  if (msg.startsWith("AURA-SHOT-403") || error.code === "42501") return new ShotForbiddenError();
  if (error.code === "23514" || msg.startsWith("AURA-SHOT-400")) {
    return new ShotValidationError([], /shots_interval/.test(msg) ? "A shot can't end before it starts" : "That value isn't allowed");
  }
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

export const listScenes = (db: SupabaseClient, projectId: string) =>
  rows(db.from("scenes").select("id, number, heading, int_ext, location, time_of_day, estimated_seconds, status").eq("project_id", projectId).order("number", { ascending: true }));
export const listSceneDna = (db: SupabaseClient, projectId: string) =>
  rows(db.from("scene_dna").select("id, scene_id, status, review_state, approved_version_id, drift").eq("project_id", projectId));
export const listDnaVersions = (db: SupabaseClient, projectId: string) =>
  rows(db.from("scene_dna_versions").select("id, scene_dna_id, version_number, content").eq("project_id", projectId));
export const listLines = (db: SupabaseClient, projectId: string) =>
  rows(db.from("dialogue_lines").select("id, scene_id, ordinal, speaker_name, character_id, text, estimated_seconds, intensity, listener_ids, status").eq("project_id", projectId));
export const listCharacters = (db: SupabaseClient, projectId: string) =>
  rows(db.from("characters").select("id, name, merged_into").eq("project_id", projectId));
export const listPlans = (db: SupabaseClient, projectId: string) => rows(db.from("shot_plans").select("*").eq("project_id", projectId));
export const listShots = (db: SupabaseClient, projectId: string) =>
  rows(db.from("shots").select("*").eq("project_id", projectId).order("ordinal", { ascending: true }));
export const listPlanVersions = (db: SupabaseClient, projectId: string) =>
  rows(db.from("shot_plan_versions").select("id, plan_id, version_number, created_at").eq("project_id", projectId));

export const generatePlan = (db: SupabaseClient, projectId: string, sceneId: string, dnaVersionId: string, shots: unknown[], engineVersion: string, replace: boolean) =>
  rpc(db, "generate_shot_plan", {
    p_project_id: projectId, p_scene_id: sceneId, p_scene_dna_version_id: dnaVersionId, p_shots: shots, p_engine_version: engineVersion, p_replace: replace,
  });
export const addShot = (db: SupabaseClient, projectId: string, sceneId: string, shot: unknown, afterOrdinal: number | null) =>
  rpc(db, "add_shot", { p_project_id: projectId, p_scene_id: sceneId, p_shot: shot, p_after_ordinal: afterOrdinal });
export const updateShot = (db: SupabaseClient, id: string, patch: Row) => rpc(db, "update_shot", { p_id: id, p_patch: patch });
export const deleteShot = (db: SupabaseClient, id: string) => rpc<number>(db, "delete_shot", { p_id: id });
export const moveShot = (db: SupabaseClient, id: string, direction: number) => rpc(db, "move_shot", { p_id: id, p_direction: direction });
export const approvePlan = (db: SupabaseClient, projectId: string, sceneId: string, coverage: unknown) =>
  rpc(db, "approve_shot_plan", { p_project_id: projectId, p_scene_id: sceneId, p_coverage: coverage });
export const setReview = (db: SupabaseClient, planId: string, state: string, reason: string | null) =>
  rpc(db, "set_shot_plan_review", { p_plan_id: planId, p_state: state, p_reason: reason });
