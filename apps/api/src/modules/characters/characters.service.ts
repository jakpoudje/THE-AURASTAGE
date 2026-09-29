// apps/api/src/modules/characters/characters.service.ts
// Domain workflow for Casting & Characters.
// Canonical object: Character (identity), CharacterAlias, CharacterAppearance (derived evidence)

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCharacterName, ScreenplayElementSchema, type CharacterAppearance } from "@aurastage/contracts";
import {
  characterCandidateExtraction,
  characterCandidateExtractionEngine,
  characterIdentityResolutionEngine,
  sceneBoundaryEngine,
  type Resolution,
} from "@aurastage/engines";
import { z } from "zod";
import { assertCharacterAccess, assertProjectAccess, assertRowAccess } from "./characters.permissions";
import * as repo from "./characters.repository";
import { toAgeStateDTO, toAliasDTO, toAppearanceDTO, toCharacterDTO, toLookDTO, toRelationshipDTO } from "./characters.mapper";
import {
  CharacterValidationError,
  ScriptNotApprovedError,
  validateAliasInput,
  validateCreateInput,
  validateLookInput,
  validateAgeStateInput,
  validateMergeInput,
  validateRelationshipInput,
  validateSyncInput,
  validateUpdateInput,
} from "./characters.validator";

export const EXTRACTION_ENGINE_VERSION = characterCandidateExtraction.ENGINE_VERSION;

/** Runs extraction + identity resolution for the approved script version. Pure apart from the reads. */
async function resolveFromApprovedScript(db: SupabaseClient, projectId: string, confirmed: string[] = []) {
  const version = await repo.getApprovedScript(db, projectId);
  if (!version) return null;
  const elements = z.array(ScreenplayElementSchema).parse(version.elements);
  const { scenes } = sceneBoundaryEngine({ elements });
  const { candidates } = characterCandidateExtractionEngine({ elements, scenes });
  const [chars, aliases] = await Promise.all([repo.listCharacters(db, projectId), repo.listAliases(db, projectId)]);
  const existing = chars.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    merged_into: (c.merged_into as string | null) ?? null,
    aliases: aliases.filter((a) => a.character_id === c.id).map((a) => a.normalized as string),
  }));
  const { resolutions } = characterIdentityResolutionEngine({ candidates, existing, confirmed_keys: confirmed });
  return { version, resolutions };
}

function toSyncItem(r: Resolution) {
  const c = r.candidate;
  const aliases = [c.display_name, ...c.aliases]
    .map((alias) => ({ alias, normalized: normalizeCharacterName(alias) }))
    .filter((a) => a.normalized);
  const appearances = c.appearances;
  if (r.decision === "match") return { decision: "match", character_id: r.character_id, aliases, appearances };
  return {
    decision: "create",
    name: c.display_name,
    normalized: c.key,
    role: c.suggested_role,
    kind: c.kind,
    age: c.age,
    description: c.introduction,
    aliases: aliases.filter((a) => a.normalized !== c.key),
    appearances,
  };
}

export async function getCastingWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const [chars, aliases, apps, sync, resolved, relationships, looks] = await Promise.all([
    repo.listCharacters(db, projectId),
    repo.listAliases(db, projectId),
    repo.listAppearances(db, projectId),
    repo.lastSync(db, projectId),
    resolveFromApprovedScript(db, projectId),
    repo.listRelationships(db, projectId),
    repo.listLooks(db, projectId),
  ]);
  const approvedVersionId = resolved?.version.id ?? null;
  const syncedVersionId = sync?.input_snapshot?.script_version_id ?? null;
  const pending = (resolved?.resolutions ?? []).filter((r) => r.decision === "confirm").map((r) => r.candidate);
  const newFromScript = (resolved?.resolutions ?? []).filter((r) => r.decision === "create").length;
  return {
    characters: chars.map(toCharacterDTO),
    aliases: aliases.map(toAliasDTO),
    appearances: apps.map(toAppearanceDTO) as CharacterAppearance[],
    relationships: relationships.map(toRelationshipDTO),
    wardrobe_looks: looks.map(toLookDTO),
    script: resolved ? { approved_version_id: resolved.version.id, version_number: resolved.version.version_number } : null,
    sync: {
      state: !approvedVersionId ? "no_script" : !syncedVersionId ? "never" : syncedVersionId === approvedVersionId && newFromScript === 0 ? "current" : "stale",
      synced_version_id: syncedVersionId,
      synced_at: sync?.completed_at ?? null,
      engine_version: sync?.engine_version ?? null,
      new_from_script: newFromScript,
    },
    pending,
  };
}

export async function syncFromScript(db: SupabaseClient, projectId: string, payload: unknown) {
  const { confirm } = validateSyncInput(payload);
  await assertProjectAccess(db, projectId);
  const resolved = await resolveFromApprovedScript(db, projectId, confirm);
  if (!resolved) throw new ScriptNotApprovedError();
  const items = resolved.resolutions.filter((r) => r.decision !== "confirm").map(toSyncItem);
  const summary = await repo.syncCharacters(db, projectId, resolved.version.id, items, EXTRACTION_ENGINE_VERSION);
  return { summary, pending: resolved.resolutions.filter((r) => r.decision === "confirm").map((r) => r.candidate) };
}

export async function editCharacter(db: SupabaseClient, characterId: string, payload: unknown) {
  const input = validateUpdateInput(payload);
  await assertCharacterAccess(db, characterId);
  let normalized: string | null = null;
  if (input.name !== undefined) {
    normalized = normalizeCharacterName(input.name);
    if (!normalized) throw new CharacterValidationError([], "Name must contain letters or numbers");
  }
  return toCharacterDTO(await repo.updateCharacter(db, characterId, input, normalized));
}

export async function addCharacterAlias(db: SupabaseClient, characterId: string, payload: unknown) {
  const { alias } = validateAliasInput(payload);
  await assertCharacterAccess(db, characterId);
  const normalized = normalizeCharacterName(alias);
  if (!normalized) throw new CharacterValidationError([], "Alias must contain letters or numbers");
  return toAliasDTO(await repo.addAlias(db, characterId, alias, normalized));
}

export async function mergeCharacters(db: SupabaseClient, projectId: string, payload: unknown) {
  const { source_id, target_id } = validateMergeInput(payload);
  await assertProjectAccess(db, projectId);
  return toCharacterDTO(await repo.mergeCharacters(db, source_id, target_id));
}

/** Undo a merge, then re-sync so the restored character gets its scenes back. */
export async function unmergeCharacter(db: SupabaseClient, characterId: string) {
  const { project_id } = await assertCharacterAccess(db, characterId);
  const restored = toCharacterDTO(await repo.unmergeCharacter(db, characterId));
  const resolved = await resolveFromApprovedScript(db, project_id);
  if (resolved) {
    const items = resolved.resolutions.filter((r) => r.decision !== "confirm").map(toSyncItem);
    await repo.syncCharacters(db, project_id, resolved.version.id, items, EXTRACTION_ENGINE_VERSION);
  }
  return restored;
}

export async function createCharacter(db: SupabaseClient, projectId: string, payload: unknown) {
  const input = validateCreateInput(payload);
  await assertProjectAccess(db, projectId);
  const normalized = normalizeCharacterName(input.name);
  if (!normalized) throw new CharacterValidationError([], "Name must contain letters or numbers");
  return toCharacterDTO(await repo.createCharacter(db, projectId, input.name, normalized, input.role, input.kind));
}

export async function setRelationship(db: SupabaseClient, projectId: string, payload: unknown) {
  const input = validateRelationshipInput(payload);
  await assertProjectAccess(db, projectId);
  return toRelationshipDTO(await repo.setRelationship(db, input.character_a, input.character_b, input.relationship, input.description || null));
}

export async function deleteRelationship(db: SupabaseClient, id: string) {
  await assertRowAccess(db, "character_relationships", id);
  await repo.deleteRelationship(db, id);
  return { deleted: true };
}

export async function saveLook(db: SupabaseClient, characterId: string, payload: unknown) {
  const input = validateLookInput(payload);
  await assertCharacterAccess(db, characterId);
  return toLookDTO(await repo.saveLook(db, input.id ?? null, characterId, input.name, input.description || null));
}

export async function deleteLook(db: SupabaseClient, id: string) {
  await assertRowAccess(db, "wardrobe_looks", id);
  await repo.deleteLook(db, id);
  return { deleted: true };
}

// Ages (migration 0035): the character at other points in the story. Scene DNA chooses which one each scene uses.
export async function listAgeStates(db: SupabaseClient, characterId: string) {
  await assertCharacterAccess(db, characterId);
  return { age_states: (await repo.listAgeStates(db, characterId)).map(toAgeStateDTO) };
}

export async function saveAgeState(db: SupabaseClient, characterId: string, payload: unknown) {
  const input = validateAgeStateInput(payload);
  await assertCharacterAccess(db, characterId);
  return toAgeStateDTO(await repo.saveAgeState(db, input.id ?? null, characterId, input.label, input.age, input.description || null));
}

export async function deleteAgeState(db: SupabaseClient, id: string) {
  await assertRowAccess(db, "character_age_states", id);
  await repo.deleteAgeState(db, id);
  return { deleted: true };
}
