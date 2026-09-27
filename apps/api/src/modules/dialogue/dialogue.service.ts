// apps/api/src/modules/dialogue/dialogue.service.ts
// Domain workflow for Dialogue Intelligence (SRS §7).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ScreenplayElementSchema } from "@aurastage/contracts";
import {
  dialogueBalanceEngine,
  dialogueExtraction,
  dialogueExtractionEngine,
  dialogueVoiceprintEngine,
  sceneBoundaryEngine,
} from "@aurastage/engines";
import { z } from "zod";
import { assertLineAccess, assertProjectAccess, assertSceneInProject } from "./dialogue.permissions";
import * as repo from "./dialogue.repository";
import { toLineDTO } from "./dialogue.mapper";
import { DialogueScriptNotApprovedError, validateUpdateLineInput } from "./dialogue.validator";

export const EXTRACTION_ENGINE_VERSION = dialogueExtraction.ENGINE_VERSION;

/** Maps a normalised cue name to the canonical (merge-followed) character id via Casting aliases. */
function characterResolver(
  chars: { id: string; merged_into: string | null }[],
  aliases: { character_id: string; normalized: string }[]
) {
  const byId = new Map(chars.map((c) => [c.id, c]));
  const follow = (id: string) => {
    let c = byId.get(id);
    for (let i = 0; i < 10 && c?.merged_into; i++) c = byId.get(c.merged_into) ?? c;
    return c?.id ?? id;
  };
  const index = new Map(aliases.map((a) => [a.normalized, follow(a.character_id)]));
  return (speakerKey: string) => index.get(speakerKey) ?? null;
}

async function buildItems(db: SupabaseClient, projectId: string) {
  const version = await repo.getApprovedVersion(db, projectId);
  if (!version) return null;
  const elements = z.array(ScreenplayElementSchema).parse(version.elements);
  const { scenes } = sceneBoundaryEngine({ elements });
  const { lines } = dialogueExtractionEngine({ elements, scenes });
  const [chars, aliases, apps] = await Promise.all([repo.listCharacters(db, projectId), repo.listAliases(db, projectId), repo.listAppearances(db, projectId)]);
  const resolve = characterResolver(chars, aliases);
  // Listeners: characters seen on screen in the scene (Casting evidence), excluding the speaker.
  const present = new Map<number, Set<string>>();
  for (const a of apps) {
    if (a.voice_only) continue;
    if (!present.has(a.scene_number)) present.set(a.scene_number, new Set());
    present.get(a.scene_number)!.add(a.character_id);
  }
  const items = lines.map((l) => {
    const character_id = resolve(l.speaker_key);
    return {
      scene_number: l.scene_number,
      ordinal: l.ordinal,
      speaker_name: l.speaker_name,
      speaker_key: l.speaker_key,
      character_id,
      extensions: l.extensions,
      parenthetical: l.parenthetical,
      text: l.text,
      text_hash: l.text_hash,
      element_index: l.element_index,
      estimated_seconds: l.estimated_seconds,
      listener_ids: [...(present.get(l.scene_number) ?? [])].filter((id) => id !== character_id),
    };
  });
  return { version, items };
}

export async function getDialogueWorkspace(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const [version, scenes, chars, rawLines, sync] = await Promise.all([
    repo.getApprovedVersion(db, projectId),
    repo.listScenes(db, projectId),
    repo.listCharacters(db, projectId),
    repo.listLines(db, projectId),
    repo.lastSync(db, projectId),
  ]);
  const lines = rawLines.map(toLineDTO);
  const active = lines.filter((l) => l.status === "active");
  const withWords = active.map((l) => ({ ...l, word_count: (l.text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length }));
  const synced = sync?.input_snapshot?.script_version_id ?? null;
  return {
    script: version ? { approved_version_id: version.id, version_number: version.version_number } : null,
    sync: {
      state: !version ? "no_script" : !synced ? "never" : synced === version.id ? "current" : "stale",
      synced_version_id: synced,
      synced_at: sync?.completed_at ?? null,
    },
    scenes,
    characters: chars.filter((c) => !c.merged_into).map((c) => ({ id: c.id, name: c.name })),
    lines,
    analysis: {
      voiceprints: dialogueVoiceprintEngine({ lines: withWords }).voiceprints,
      balance: dialogueBalanceEngine({ lines: withWords }).scenes,
      unresolved_speakers: [...new Set(active.filter((l) => !l.character_id).map((l) => l.speaker_name))],
      review_required: lines.filter((l) => l.review_state === "review_required").length,
    },
  };
}

export async function syncDialogue(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const built = await buildItems(db, projectId);
  if (!built) throw new DialogueScriptNotApprovedError();
  return repo.syncLines(db, projectId, built.version.id, built.items, EXTRACTION_ENGINE_VERSION);
}

export async function updateDialogueLine(db: SupabaseClient, lineId: string, payload: unknown) {
  const input = validateUpdateLineInput(payload);
  await assertLineAccess(db, lineId);
  return toLineDTO(await repo.updateLine(db, lineId, input));
}

export async function approveSceneDialogue(db: SupabaseClient, projectId: string, sceneId: string) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  return { approved_lines: await repo.approveScene(db, projectId, sceneId) };
}
