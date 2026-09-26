// apps/api/src/modules/screenplay/screenplay.service.ts
// Domain workflow and transaction boundaries.
// Domain: Scriptwriter
// Canonical object: Script / ScriptVersion / Scene

import type { SupabaseClient } from "@supabase/supabase-js";
import { ScreenplayElementSchema, type ScopePlan } from "@aurastage/contracts";
import { runtimeScopeEngine } from "@aurastage/engines";
import { z } from "zod";
import { assertProjectAccess } from "./screenplay.permissions";
import * as repo from "./screenplay.repository";
import { toSceneDTO, toScriptDTO, toScriptVersionDTO } from "./screenplay.mapper";
import { deriveScenes, parseScreenplay, PARSER_VERSION, SCENE_ENGINE_VERSION } from "./screenplay.derive";
import {
  ScriptNotFoundError,
  ScriptValidationError,
  validateApproveInput,
  validateSaveInput,
  validateScopeQuery,
} from "./screenplay.validator";

/** Everything the Scriptwriter workspace needs in one read. */
export async function getWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const scriptRow = await repo.getScriptByProject(db, projectId);
  if (!scriptRow) {
    return { script: null, current_version: null, versions: [], scenes: [], analysis: null };
  }
  const script = toScriptDTO(scriptRow);
  const [versionRow, versions, sceneRows] = await Promise.all([
    script.current_version_id ? repo.getVersion(db, script.current_version_id) : Promise.resolve(null),
    repo.listVersions(db, script.id),
    repo.listScenes(db, projectId),
  ]);
  const current_version = versionRow ? toScriptVersionDTO(versionRow) : null;
  return {
    script,
    current_version,
    versions,
    scenes: sceneRows.map(toSceneDTO),
    analysis: current_version ? deriveScenes(current_version.elements).analysis : null,
  };
}

export async function saveScriptVersion(db: SupabaseClient, projectId: string, payload: unknown) {
  const input = validateSaveInput(payload);
  await assertProjectAccess(db, projectId);
  const elements = parseScreenplay(input.source_text);
  const row = await repo.saveVersion(db, {
    projectId,
    baseVersionId: input.base_version_id,
    sourceText: input.source_text,
    elements,
    parserVersion: PARSER_VERSION,
    note: input.note ?? null,
  });
  return toScriptVersionDTO(row);
}

export async function approveScript(db: SupabaseClient, projectId: string, payload: unknown) {
  const { version_id } = validateApproveInput(payload);
  await assertProjectAccess(db, projectId);
  const versionRow = await repo.getVersion(db, version_id);
  if (!versionRow) throw new ScriptNotFoundError("Script version not found");
  // Re-derive from the stored elements of that exact version, never from editor state.
  const elements = z.array(ScreenplayElementSchema).parse(versionRow.elements);
  const { scenes } = deriveScenes(elements);
  if (scenes.length === 0) {
    throw new ScriptValidationError(
      [{ message: "No scene headings found (lines starting with INT. or EXT.)" }],
      "This version has no scenes to approve yet"
    );
  }
  const scriptRow = await repo.approveVersion(db, {
    projectId,
    versionId: version_id,
    scenes,
    engineVersion: SCENE_ENGINE_VERSION,
  });
  return toScriptDTO(scriptRow);
}

export async function getScopePlan(db: SupabaseClient, projectId: string, query: unknown): Promise<ScopePlan | null> {
  const { mean_scene_minutes } = validateScopeQuery(query);
  await assertProjectAccess(db, projectId);
  const { data, error } = await db
    .from("projects")
    .select("target_runtime_minutes, genre, type")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  if (!data.target_runtime_minutes) return null;
  return runtimeScopeEngine({
    target_runtime_minutes: data.target_runtime_minutes,
    genre: data.genre,
    type: data.type,
    mean_scene_minutes_override: mean_scene_minutes,
  });
}
