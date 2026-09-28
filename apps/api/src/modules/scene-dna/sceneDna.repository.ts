// apps/api/src/modules/scene-dna/sceneDna.repository.ts
// Canonical persistence for SceneDNA. Reads Scriptwriter (scripts, script_versions,
// scenes), Casting (characters, character_appearances, wardrobe_looks) and
// Dialogue (dialogue_lines) read-only; writes only via the migration-0011 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SceneDnaConflictError, SceneDnaNotFoundError, SceneDnaValidationError } from "./sceneDna.validator";
import { SceneDnaForbiddenError } from "./sceneDna.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

type Row = Record<string, any>;

function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-SDNA-\d+:\s*/, "");
  if (msg.startsWith("AURA-SDNA-409")) return new SceneDnaConflictError(text);
  if (msg.startsWith("AURA-SDNA-404")) return new SceneDnaNotFoundError(text);
  if (msg.startsWith("AURA-SDNA-403") || error.code === "42501") return new SceneDnaForbiddenError(colForbiddenMessage(error));
  if (error.code === "23514" || msg.startsWith("AURA-SDNA-400")) return new SceneDnaValidationError([], "That value isn't allowed");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}

async function rows<T = Record<string, any>>(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}
async function rpc<T>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

export async function getApprovedVersion(db: SupabaseClient, projectId: string) {
  const { data, error } = await db.from("scripts").select("id, approved_version_id").eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  if (!data?.approved_version_id) return null;
  const { data: v, error: vErr } = await db.from("script_versions").select("id, version_number, elements").eq("id", data.approved_version_id).single();
  if (vErr) throw vErr;
  return v as { id: string; version_number: number; elements: unknown[] };
}

export const listScenes = (db: SupabaseClient, projectId: string) =>
  rows(
    db
      .from("scenes")
      .select("id, number, heading, int_ext, location, time_of_day, estimated_seconds, element_start, element_end, content_hash, source_version_id, status")
      .eq("project_id", projectId)
      .order("number", { ascending: true })
  );
export const listCharacters = (db: SupabaseClient, projectId: string) =>
  rows(db.from("characters").select("id, name, role, kind, status, age, gender, description, merged_into").eq("project_id", projectId));
export const listAppearances = (db: SupabaseClient, projectId: string) =>
  rows(db.from("character_appearances").select("character_id, scene_id, speaking, voice_only, line_count").eq("project_id", projectId));
export const listLooks = (db: SupabaseClient, projectId: string) =>
  rows(db.from("wardrobe_looks").select("id, character_id, name, description").eq("project_id", projectId).order("name", { ascending: true }));
export const listLines = (db: SupabaseClient, projectId: string) =>
  rows(
    db
      .from("dialogue_lines")
      .select("id, scene_id, ordinal, speaker_name, character_id, text, text_hash, intention, subtext, emotion, intensity, approval, review_state, status")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true })
      .order("ordinal", { ascending: true })
  );
export const listSceneDna = (db: SupabaseClient, projectId: string) => rows(db.from("scene_dna").select("*").eq("project_id", projectId));
export const listVersions = (db: SupabaseClient, projectId: string) =>
  rows(db.from("scene_dna_versions").select("id, scene_dna_id, version_number, dependencies, engine_version, created_at").eq("project_id", projectId));

export const saveSceneDna = (db: SupabaseClient, projectId: string, sceneId: string, patch: Row) =>
  rpc<Row>(db, "save_scene_dna", { p_project_id: projectId, p_scene_id: sceneId, p_patch: patch });
export const approveSceneDna = (db: SupabaseClient, projectId: string, sceneId: string, content: unknown, dependencies: unknown, engineVersion: string) =>
  rpc<Row>(db, "approve_scene_dna", {
    p_project_id: projectId,
    p_scene_id: sceneId,
    p_content: content,
    p_dependencies: dependencies,
    p_engine_version: engineVersion,
  });
export const setDrift = (db: SupabaseClient, sceneDnaId: string, state: string, drift: unknown) =>
  rpc<Row>(db, "set_scene_dna_drift", { p_scene_dna_id: sceneDnaId, p_state: state, p_drift: drift });
