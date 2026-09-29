// apps/api/src/modules/characters/characters.repository.ts
// Canonical persistence access for Casting. Reads Scriptwriter tables
// (scripts, script_versions) read-only; writes only via migration-0006 functions.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CharacterConflictError, CharacterNotFoundError, CharacterValidationError } from "./characters.validator";
import { CharacterForbiddenError } from "./characters.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

export function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-CHR-\d+:\s*/, "");
  if (msg.startsWith("AURA-CHR-409") || msg.startsWith("AURA-CHR-429")) return new CharacterConflictError(text);
  if (msg.startsWith("AURA-CHR-404")) return new CharacterNotFoundError(text);
  if (msg.startsWith("AURA-CHR-400")) return new CharacterValidationError([], text);
  if (msg.startsWith("AURA-CHR-403") || error.code === "42501") return new CharacterForbiddenError(colForbiddenMessage(error));
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getApprovedScript(db: SupabaseClient, projectId: string) {
  const { data, error } = await db
    .from("scripts")
    .select("id, approved_version_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.approved_version_id) return null;
  const { data: v, error: vErr } = await db
    .from("script_versions")
    .select("id, version_number, elements")
    .eq("id", data.approved_version_id)
    .single();
  if (vErr) throw vErr;
  return v as { id: string; version_number: number; elements: unknown[] };
}

export const listCharacters = (db: SupabaseClient, projectId: string) =>
  rows<Record<string, unknown>>(db.from("characters").select("*").eq("project_id", projectId).order("created_at", { ascending: true }));
export const listAliases = (db: SupabaseClient, projectId: string) =>
  rows<Record<string, unknown>>(db.from("character_aliases").select("id, character_id, alias, normalized, source").eq("project_id", projectId));
export const listAppearances = (db: SupabaseClient, projectId: string) =>
  rows<Record<string, unknown>>(
    db
      .from("character_appearances")
      .select("id, character_id, scene_id, scene_number, source_version_id, speaking, voice_only, line_count, confidence, evidence")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true })
  );

export const listRelationships = (db: SupabaseClient, projectId: string) =>
  rows<Record<string, unknown>>(db.from("character_relationships").select("id, project_id, character_a, character_b, relationship, description, created_at, updated_at").eq("project_id", projectId));
export const listLooks = (db: SupabaseClient, projectId: string) =>
  rows<Record<string, unknown>>(
    db.from("wardrobe_looks").select("id, project_id, character_id, name, description, created_at, updated_at").eq("project_id", projectId).order("created_at", { ascending: true })
  );

export async function lastSync(db: SupabaseClient, projectId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("input_snapshot, output_refs, engine_version, completed_at")
    .eq("project_id", projectId)
    .eq("engine_id", "character.characterCandidateExtractionEngine")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { input_snapshot: { script_version_id?: string }; output_refs: unknown; engine_version: string; completed_at: string } | null;
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

export const syncCharacters = (db: SupabaseClient, projectId: string, versionId: string, items: unknown[], engineVersion: string) =>
  rpc<Record<string, unknown>>(db, "sync_script_characters", {
    p_project_id: projectId,
    p_version_id: versionId,
    p_items: items,
    p_engine_version: engineVersion,
  });
export const updateCharacter = (db: SupabaseClient, id: string, patch: Record<string, unknown>, normalizedName: string | null) =>
  rpc<Record<string, unknown>>(db, "update_character", { p_character_id: id, p_patch: patch, p_normalized_name: normalizedName });
export const addAlias = (db: SupabaseClient, id: string, alias: string, normalized: string) =>
  rpc<Record<string, unknown>>(db, "add_character_alias", { p_character_id: id, p_alias: alias, p_normalized: normalized });
export const mergeCharacters = (db: SupabaseClient, sourceId: string, targetId: string) =>
  rpc<Record<string, unknown>>(db, "merge_characters", { p_source_id: sourceId, p_target_id: targetId });
export const unmergeCharacter = (db: SupabaseClient, id: string) =>
  rpc<Record<string, unknown>>(db, "unmerge_character", { p_source_id: id });
export const createCharacter = (db: SupabaseClient, projectId: string, name: string, normalized: string, role: string, kind: string) =>
  rpc<Record<string, unknown>>(db, "create_character", { p_project_id: projectId, p_name: name, p_normalized: normalized, p_role: role, p_kind: kind });
export const setRelationship = (db: SupabaseClient, a: string, b: string, relationship: string, description: string | null) =>
  rpc<Record<string, unknown>>(db, "set_character_relationship", { p_a: a, p_b: b, p_relationship: relationship, p_description: description });
export const deleteRelationship = (db: SupabaseClient, id: string) => rpc<null>(db, "delete_character_relationship", { p_id: id });
export const saveLook = (db: SupabaseClient, id: string | null, characterId: string, name: string, description: string | null) =>
  rpc<Record<string, unknown>>(db, "save_wardrobe_look", { p_id: id, p_character_id: characterId, p_name: name, p_description: description });
export const deleteLook = (db: SupabaseClient, id: string) => rpc<null>(db, "delete_wardrobe_look", { p_id: id });
export const listAgeStates = (db: SupabaseClient, characterId: string) =>
  rows(db.from("character_age_states").select("id, project_id, character_id, label, age, description, created_at, updated_at").eq("character_id", characterId).order("created_at", { ascending: true }));
export const saveAgeState = (db: SupabaseClient, id: string | null, characterId: string, label: string, age: string, description: string | null) =>
  rpc<Record<string, unknown>>(db, "save_character_age_state", { p_id: id, p_character_id: characterId, p_label: label, p_age: age, p_description: description });
export const deleteAgeState = (db: SupabaseClient, id: string) => rpc<null>(db, "delete_character_age_state", { p_id: id });
