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
  storyAccentEngine,
  characterDuplicateEngine,
  relationshipMapEngine,
  pronunciationEngine,
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
  validateDistinctInput,
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

type StoryPlaces = Awaited<ReturnType<typeof repo.storyPlaces>>;
/** How each character might speak, from what the story says (never from a name) — a suggestion the writer can use. */
function accentSuggestions(chars: Record<string, any>[], apps: Record<string, any>[], story: StoryPlaces) {
  const locationOf = new Map(story.scenes.map((s) => [s.id as string, String(s.location ?? "")]));
  return Object.fromEntries(chars.map((c) => [c.id as string, storyAccentEngine({
    character: { nationality: c.nationality ?? null, description: c.description ?? null, backstory: c.backstory ?? null, occupation: c.occupation ?? null },
    scene_locations: apps.filter((a) => a.character_id === c.id).map((a) => locationOf.get(a.scene_id as string) ?? "").filter(Boolean).slice(0, 400),
    project: { setting: story.project?.setting ?? null, time_period: story.project?.time_period ?? null, logline: story.project?.logline ?? null },
  })]));
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/**
 * One click for the whole cast (owner request 2026-09-30): fills only EMPTY profile fields from what the platform already
 * knows without AI — the age and introduction the script gives, and the accent and languages the story suggests. Written
 * fields are never changed. Each character is saved through the same gated save as a manual edit.
 */
export async function applySuggestedProfiles(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const [chars, apps, story, resolved] = await Promise.all([
    repo.listCharacters(db, projectId), repo.listAppearances(db, projectId), repo.storyPlaces(db, projectId), resolveFromApprovedScript(db, projectId),
  ]);
  const active = chars.filter((c) => !c.merged_into);
  const accents = accentSuggestions(active, apps, story);
  const fromScript = new Map((resolved?.resolutions ?? []).filter((r) => r.decision === "match").map((r) => [r.character_id as string, r.candidate]));
  const updated: { id: string; name: string; fields: string[] }[] = [];
  for (const c of active) {
    const patch: Record<string, string> = {};
    const cand = fromScript.get(c.id as string);
    if (blank(c.age) && cand?.age) patch.age = String(cand.age).slice(0, 40);
    if (blank(c.description) && cand?.introduction) patch.description = String(cand.introduction).slice(0, 2000);
    const sug = accents[c.id as string]?.suggestion;
    if (sug && blank(c.accent)) patch.accent = sug.accent.slice(0, 120);
    if (sug && blank(c.languages) && sug.languages.length) patch.languages = sug.languages.join(", ").slice(0, 200);
    if (blank(c.pronunciation)) {
      const pr = pronunciationEngine({ name: String(c.name).slice(0, 200), languages: (patch.languages ?? c.languages ?? null) as string | null, accent: (patch.accent ?? c.accent ?? null) as string | null }).pronunciation;
      if (pr) patch.pronunciation = pr;
    }
    if (!Object.keys(patch).length) continue;
    await editCharacter(db, c.id as string, patch);
    updated.push({ id: c.id as string, name: c.name as string, fields: Object.keys(patch) });
  }
  return { updated, unchanged: active.length - updated.length };
}

/**
 * What the script and story already say about each character (read-only), for the built-in story intelligence in
 * Ask AuraStage (owner, 2026-09-30): the approved script's elements, each character's introduction and age as the
 * script gives them, and the accent the story suggests. No writes.
 */
export async function profileEvidence(db: SupabaseClient, projectId: string) {
  const [chars, apps, story, resolved, relationships, looks] = await Promise.all([
    repo.listCharacters(db, projectId), repo.listAppearances(db, projectId), repo.storyPlaces(db, projectId), resolveFromApprovedScript(db, projectId),
    repo.listRelationships(db, projectId), repo.listLooks(db, projectId),
  ]);
  const active = chars.filter((c) => !c.merged_into);
  const accents = accentSuggestions(active, apps, story);
  const fromScript = new Map((resolved?.resolutions ?? []).filter((r) => r.decision === "match").map((r) => [r.character_id as string, r.candidate]));
  return {
    elements: (resolved?.version.elements ?? []) as { index: number; type: string; text: string; speaker?: string }[],
    appearances: apps,
    relationships,
    looks,
    characters: Object.fromEntries(active.map((c) => {
      const cand = fromScript.get(c.id as string);
      return [c.id as string, { introduction: (cand?.introduction as string | null) ?? null, age: (cand?.age as string | null) ?? null, accent: accents[c.id as string]?.suggestion ?? null }];
    })) as Record<string, { introduction: string | null; age: string | null; accent: { accent: string; languages: string[]; evidence: string[] } | null }>,
  };
}


/**
 * The relationship map (BUILD_PLAN §8 item 12): who shares scenes (the approved script's appearances) and relationships
 * the dialogue states, as suggestions with their line. Free, built-in; a person adds one with "Add" (setRelationship).
 */
function relationshipMap(chars: Record<string, unknown>[], aliases: Record<string, unknown>[], apps: Record<string, unknown>[], relationships: Record<string, unknown>[], elements: { type: string; text: string; speaker?: string }[]) {
  const active = chars.filter((c) => !c.merged_into);
  const byAlias = new Map<string, string>();
  for (const a of aliases) byAlias.set(a.normalized as string, a.character_id as string);
  for (const c of active) byAlias.set(normalizeCharacterName(c.name as string), c.id as string);
  const sceneId = new Map(apps.map((a) => [Number(a.scene_number), a.scene_id as string]));
  const lines: { scene_id: string; scene_number: number; speaker_id: string | null; text: string }[] = [];
  let scene = 0, speaker: string | null = null;
  for (const e of elements) {
    if (e.type === "scene_heading") { scene++; speaker = null; continue; }
    if (e.type === "character") { speaker = e.speaker ? byAlias.get(normalizeCharacterName(e.speaker)) ?? null : null; continue; }
    if (e.type === "dialogue" && sceneId.has(scene)) lines.push({ scene_id: sceneId.get(scene)!, scene_number: scene, speaker_id: speaker, text: e.text.slice(0, 4000) });
  }
  return relationshipMapEngine({
    characters: active.map((c) => ({ id: c.id as string, name: String(c.name).slice(0, 200) })),
    appearances: apps.map((a) => ({ character_id: a.character_id as string, scene_id: a.scene_id as string })),
    lines: lines.slice(0, 50000),
    relationships: relationships.map((r) => ({ character_a: r.character_a as string, character_b: r.character_b as string, relationship: r.relationship as string })),
  });
}

export async function getCastingWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const [chars, aliases, apps, sync, resolved, relationships, looks, story] = await Promise.all([
    repo.listCharacters(db, projectId),
    repo.listAliases(db, projectId),
    repo.listAppearances(db, projectId),
    repo.lastSync(db, projectId),
    resolveFromApprovedScript(db, projectId),
    repo.listRelationships(db, projectId),
    repo.listLooks(db, projectId),
    repo.storyPlaces(db, projectId),
  ]);
  const accent_suggestions = accentSuggestions(chars, apps, story);
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
    accent_suggestions,
    relationship_map: relationshipMap(chars, aliases, apps, relationships, (resolved?.version.elements ?? []) as { type: string; text: string; speaker?: string }[]),
    // Characters that look like the same person (owner report: "characters named twice") — merge or "not the same".
    duplicates: characterDuplicateEngine({
      characters: chars.filter((c) => !c.merged_into).map((c) => ({
        id: c.id as string, name: c.name as string,
        aliases: aliases.filter((a) => a.character_id === c.id && a.source !== "name").map((a) => a.alias as string),
        scene_count: new Set(apps.filter((a) => a.character_id === c.id).map((a) => a.scene_id)).size,
        approved: c.status === "approved",
        distinct_from: ((c.distinct_from ?? []) as string[]),
      })),
    }).pairs,
  };
}

/** A person says two characters are different people: the duplicate suggestion for them never comes back. */
export async function markCharactersDistinct(db: SupabaseClient, projectId: string, payload: unknown) {
  const { a_id, b_id } = validateDistinctInput(payload);
  await assertProjectAccess(db, projectId);
  await repo.markDistinct(db, a_id, b_id);
  return { ok: true };
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
