// apps/api/src/modules/audio/audio.batch.ts
// One click for the whole film (owner, 2026-10-02): spot every scene, generate every planned sound, and put every
// finished sound on the cue it was made for — for one scene or all of them. Each step uses the same gated writes as
// the per-scene and per-clip buttons, so a person can still do any of it by hand, and nothing already placed is
// replaced (rule 11): only planned cues (no audio yet) receive a generated sound.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertProjectAccess, assertSceneInProject } from "./audio.permissions";
import * as repo from "./audio.repository";
import { generateSceneCues } from "./audio.generation";
import { getAudioWorkspace, spotScene, updateClip } from "./audio.service";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;

/** Spots every scene whose approved shot plan is usable and that has no audio session yet. */
export async function spotAllScenes(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const ws = await getAudioWorkspace(db, projectId);
  const spotted: number[] = [], waiting: number[] = [];
  for (const s of ws.scenes) {
    if (s.session) continue;
    if (!s.plan?.usable) { waiting.push(s.scene.number); continue; }
    await spotScene(db, projectId, s.scene.id);
    spotted.push(s.scene.number);
  }
  return { spotted, waiting, already: ws.scenes.filter((s) => s.session).length };
}

/** Generates the planned sounds of one scene (sceneId) or of every spotted scene. */
export async function generateAllCues(db: SupabaseClient, projectId: string, sceneId: string | null, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  if (sceneId) await assertSceneInProject(db, projectId, sceneId);
  const sessions = await repo.listSessions(db, projectId);
  const scenes = sessions.filter((s) => !sceneId || s.scene_id === sceneId);
  let requested = 0, skipped = 0;
  for (const s of scenes) {
    const r = await generateSceneCues(db, projectId, s.scene_id as string, env);
    requested += r.requested.length;
    skipped += r.skipped.length;
  }
  return { scenes: scenes.length, requested, skipped };
}

/**
 * Puts each finished generated sound on the planned cue it was made for (the newest finished take when there are
 * several). Clips that already hold a recording are never touched; cues whose sound is still being made are counted.
 */
export async function placeGenerated(db: SupabaseClient, projectId: string, sceneId: string | null) {
  await assertProjectAccess(db, projectId);
  if (sceneId) await assertSceneInProject(db, projectId, sceneId);
  const [sessions, clips, gens] = await Promise.all([repo.listSessions(db, projectId), repo.listClips(db, projectId), repo.listGenerations(db, projectId)]);
  const sessionIds = new Set(sessions.filter((s) => !sceneId || s.scene_id === sceneId).map((s) => s.id as string));
  const newest = new Map<string, Row>();
  const making = new Set<string>();
  for (const g of [...gens].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))) {
    if (!g.clip_id) continue;
    if (g.status === "succeeded" && g.asset_id && !newest.has(g.clip_id)) newest.set(g.clip_id, g);
    if (g.status === "queued" || g.status === "running") making.add(g.clip_id);
  }
  const placed: string[] = [];
  let stillMaking = 0, nothingYet = 0;
  for (const c of clips.filter((x) => sessionIds.has(x.session_id) && x.kind === "cue")) {
    const g = newest.get(c.id);
    if (g) { await updateClip(db, c.id, { asset_id: g.asset_id, label: String(c.label).slice(0, 200) }); placed.push(c.label); }
    else if (making.has(c.id)) stillMaking++;
    else nothingYet++;
  }
  return { placed: placed.length, still_making: stillMaking, not_generated: nothingYet };
}
