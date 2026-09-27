// apps/api/src/modules/dialogue/dialogue.repository.ts
// Canonical persistence for DialogueLine. Reads Scriptwriter (scripts, script_versions,
// scenes) and Casting (characters, aliases, appearances) read-only; writes only via
// the migration-0010 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DialogueConflictError, DialogueNotFoundError, DialogueValidationError } from "./dialogue.validator";
import { DialogueForbiddenError } from "./dialogue.permissions";

function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-DLG-\d+:\s*/, "");
  if (msg.startsWith("AURA-DLG-409")) return new DialogueConflictError(text);
  if (msg.startsWith("AURA-DLG-404")) return new DialogueNotFoundError(text);
  if (msg.startsWith("AURA-DLG-403") || error.code === "42501") return new DialogueForbiddenError();
  if (error.code === "23514") return new DialogueValidationError([], "That value isn't allowed");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
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
  rows<Record<string, unknown>>(
    db.from("scenes").select("id, number, heading, status, review_state").eq("project_id", projectId).order("number", { ascending: true })
  );
export const listCharacters = (db: SupabaseClient, projectId: string) =>
  rows<{ id: string; name: string; merged_into: string | null }>(db.from("characters").select("id, name, merged_into").eq("project_id", projectId));
export const listAliases = (db: SupabaseClient, projectId: string) =>
  rows<{ character_id: string; normalized: string }>(db.from("character_aliases").select("character_id, normalized").eq("project_id", projectId));
export const listAppearances = (db: SupabaseClient, projectId: string) =>
  rows<{ character_id: string; scene_number: number; voice_only: boolean }>(
    db.from("character_appearances").select("character_id, scene_number, voice_only").eq("project_id", projectId)
  );
export const listLines = (db: SupabaseClient, projectId: string) =>
  rows<Record<string, unknown>>(
    db.from("dialogue_lines").select("*").eq("project_id", projectId).order("scene_number", { ascending: true }).order("ordinal", { ascending: true })
  );

export async function lastSync(db: SupabaseClient, projectId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("input_snapshot, completed_at")
    .eq("project_id", projectId)
    .eq("engine_id", "dialogue.dialogueExtractionEngine")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { input_snapshot: { script_version_id?: string }; completed_at: string } | null;
}

export const syncLines = (db: SupabaseClient, projectId: string, versionId: string, items: unknown[], engineVersion: string) =>
  rpc<Record<string, number>>(db, "sync_dialogue_lines", { p_project_id: projectId, p_version_id: versionId, p_items: items, p_engine_version: engineVersion });
export const updateLine = (db: SupabaseClient, id: string, patch: Record<string, unknown>) =>
  rpc<Record<string, unknown>>(db, "update_dialogue_line", { p_id: id, p_patch: patch });
export const approveScene = (db: SupabaseClient, projectId: string, sceneId: string) =>
  rpc<number>(db, "approve_scene_dialogue", { p_project_id: projectId, p_scene_id: sceneId });
