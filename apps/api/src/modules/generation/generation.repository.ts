// apps/api/src/modules/generation/generation.repository.ts
// Canonical persistence for GenerationPackage / Take. Reads Project, Scriptwriter
// (scenes), Scene DNA, Storyboard (shot plans + approved versions), Casting and
// Dialogue read-only; writes only via the migration-0013 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { GenerationConflictError, GenerationNotFoundError, GenerationNotReadyError, GenerationValidationError } from "./generation.validator";
import { GenerationForbiddenError } from "./generation.permissions";

type Row = Record<string, any>;

function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-GEN-\d+:\s*/, "");
  if (msg.startsWith("AURA-GEN-409")) return new GenerationConflictError(text);
  if (msg.startsWith("AURA-GEN-412")) return new GenerationNotReadyError(text);
  if (msg.startsWith("AURA-GEN-404")) return new GenerationNotFoundError(text);
  if (msg.startsWith("AURA-GEN-403") || error.code === "42501") return new GenerationForbiddenError();
  if (msg.startsWith("AURA-GEN-400") || error.code === "23514") return new GenerationValidationError([], text || "That value isn't allowed");
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
  return (data ?? null) as Row | null;
}
async function rpc<T = Row>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

export const getProject = (db: SupabaseClient, id: string) =>
  one(db.from("projects").select("id, title, genre, tone, setting, time_period").eq("id", id).maybeSingle());
export const listScenes = (db: SupabaseClient, projectId: string) =>
  rows(db.from("scenes").select("id, number, heading, int_ext, location, time_of_day, status").eq("project_id", projectId).order("number", { ascending: true }));
export const listPlans = (db: SupabaseClient, projectId: string) =>
  rows(db.from("shot_plans").select("id, scene_id, status, review_state, review_reason, approved_version_id").eq("project_id", projectId));
export const listPlanVersions = (db: SupabaseClient, projectId: string) =>
  rows(db.from("shot_plan_versions").select("id, plan_id, version_number, scene_dna_version_id, shots").eq("project_id", projectId));
export const getDnaVersion = (db: SupabaseClient, id: string) =>
  one(db.from("scene_dna_versions").select("id, version_number, content").eq("id", id).maybeSingle());
export const getScriptVersionId = async (db: SupabaseClient, projectId: string) =>
  ((await one(db.from("scripts").select("approved_version_id").eq("project_id", projectId).maybeSingle()))?.approved_version_id as string | undefined) ?? null;
export const listCharacters = (db: SupabaseClient, projectId: string) =>
  rows(db.from("characters").select("id, name, age, description").eq("project_id", projectId));
export const listLooks = (db: SupabaseClient, projectId: string) =>
  rows(db.from("wardrobe_looks").select("id, character_id, name, description").eq("project_id", projectId));
export const listLines = (db: SupabaseClient, projectId: string) =>
  rows(db.from("dialogue_lines").select("id, speaker_name, text, emotion").eq("project_id", projectId));
export const listPackages = (db: SupabaseClient, projectId: string) =>
  rows(db.from("generation_packages").select("*").eq("project_id", projectId).order("created_at", { ascending: false }));
export const listTakes = (db: SupabaseClient, projectId: string) =>
  rows(db.from("takes").select("*").eq("project_id", projectId).order("take_number", { ascending: true }));
export const getPackage = (db: SupabaseClient, id: string) => one(db.from("generation_packages").select("*").eq("id", id).maybeSingle());
export const getTake = (db: SupabaseClient, id: string) => one(db.from("takes").select("*").eq("id", id).maybeSingle());

export const createPackage = (db: SupabaseClient, a: { projectId: string; sceneId: string; shotId: string; planVersionId: string; content: unknown; engineVersion: string }) =>
  rpc(db, "create_generation_package", {
    p_project_id: a.projectId, p_scene_id: a.sceneId, p_shot_id: a.shotId, p_shot_plan_version_id: a.planVersionId, p_content: a.content, p_engine_version: a.engineVersion,
  });
export const requestTakes = (db: SupabaseClient, a: { packageId: string; provider: string; model: string; capability: string; params: unknown; seed: number | null; variations: number; sourceTakeId: string | null; idempotencyKey: string | null }) =>
  rpc<Row[]>(db, "request_takes", {
    p_package_id: a.packageId, p_provider: a.provider, p_model: a.model, p_capability: a.capability, p_params: a.params, p_seed: a.seed,
    p_variations: a.variations, p_source_take_id: a.sourceTakeId, p_idempotency_key: a.idempotencyKey,
  });
export const setApproval = (db: SupabaseClient, id: string, approval: string) => rpc(db, "set_take_approval", { p_take_id: id, p_approval: approval });
export const cancelTake = (db: SupabaseClient, id: string) => rpc(db, "cancel_take", { p_take_id: id });
export const setPackageReview = (db: SupabaseClient, id: string, state: string, reason: string | null) =>
  rpc(db, "set_package_review", { p_package_id: id, p_state: state, p_reason: reason });
