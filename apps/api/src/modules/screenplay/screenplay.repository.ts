// apps/api/src/modules/screenplay/screenplay.repository.ts
// Canonical persistence access for this domain.
// Domain: Scriptwriter
// Canonical object: Script / ScriptVersion / Scene
//
// Reads go through RLS with the caller's own token. Writes go only through
// the save_script_version / approve_script_version database functions, which
// do membership, optimistic concurrency, versioning and audit in one
// transaction (migration 0004).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScreenplayElement } from "@aurastage/contracts";
import { ScriptConflictError, ScriptNotFoundError } from "./screenplay.validator";
import { ScriptForbiddenError } from "./screenplay.permissions";

function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  if (msg.startsWith("AURA-SCR-409")) return new ScriptConflictError();
  if (msg.startsWith("AURA-SCR-404")) return new ScriptNotFoundError(msg.replace(/^AURA-SCR-404:\s*/, ""));
  if (msg.startsWith("AURA-SCR-403") || error.code === "42501") return new ScriptForbiddenError();
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}

export async function getScriptByProject(db: SupabaseClient, projectId: string) {
  const { data, error } = await db.from("scripts").select("*").eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVersion(db: SupabaseClient, versionId: string) {
  const { data, error } = await db.from("script_versions").select("*").eq("id", versionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listVersions(db: SupabaseClient, scriptId: string) {
  const { data, error } = await db
    .from("script_versions")
    .select("id, version_number, note, parser_version, created_by, created_at")
    .eq("script_id", scriptId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listScenes(db: SupabaseClient, projectId: string) {
  const { data, error } = await db
    .from("scenes")
    .select("*")
    .eq("project_id", projectId)
    .order("number", { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveVersion(
  db: SupabaseClient,
  args: {
    projectId: string;
    baseVersionId: string | null;
    sourceText: string;
    elements: ScreenplayElement[];
    parserVersion: string;
    note: string | null;
  }
) {
  const { data, error } = await db.rpc("save_script_version", {
    p_project_id: args.projectId,
    p_base_version_id: args.baseVersionId,
    p_source_text: args.sourceText,
    p_elements: args.elements,
    p_parser_version: args.parserVersion,
    p_note: args.note,
  });
  if (error) throw mapDbError(error);
  return data;
}

export async function approveVersion(
  db: SupabaseClient,
  args: { projectId: string; versionId: string; scenes: unknown[]; engineVersion: string }
) {
  const { data, error } = await db.rpc("approve_script_version", {
    p_project_id: args.projectId,
    p_version_id: args.versionId,
    p_scenes: args.scenes,
    p_engine_version: args.engineVersion,
  });
  if (error) throw mapDbError(error);
  return data;
}
