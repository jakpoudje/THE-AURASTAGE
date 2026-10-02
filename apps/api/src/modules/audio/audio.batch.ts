// apps/api/src/modules/audio/audio.batch.ts
// One click for the whole film (owner, 2026-10-02): spot every scene, generate every planned sound, and put every
// finished sound on the cue it was made for — for one scene or all of them. Each step uses the same gated writes as
// the per-scene and per-clip buttons, so a person can still do any of it by hand, and nothing already placed is
// replaced (rule 11): only planned cues (no audio yet) receive a generated sound.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertProjectAccess, assertSceneInProject } from "./audio.permissions";
import * as repo from "./audio.repository";
import { audioBackendsFor } from "../../providers";
import { cueRequest, FAMILY_KIND, generateSound } from "./audio.generation";
import { AudioBusyError } from "./audio.validator";
import { getAudioWorkspace, spotScene, updateClip } from "./audio.service";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
const BUDGET_MS = 25_000;
/** `size` at a time until done or the time budget is spent (each call says how many remain; the page calls again). */
async function pool<T>(items: T[], fn: (item: T) => Promise<void>, size = 4, budgetMs = BUDGET_MS) {
  const t0 = Date.now();
  let i = 0, done = 0;
  const worker = async () => { while (i < items.length && Date.now() - t0 < budgetMs) { const it = items[i++]; await fn(it); done++; } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return done;
}

/** Spots every scene whose approved shot plan is usable and that has no audio session yet. */
/** `opts.budgetMs`: how long one round may take (production runs give each step a share of a round). */
export type Round = { budgetMs?: number };

export async function spotAllScenes(db: SupabaseClient, projectId: string, opts: Round = {}) {
  await assertProjectAccess(db, projectId);
  const ws = await getAudioWorkspace(db, projectId);
  const spotted: number[] = [], waiting: number[] = [];
  const todo = ws.scenes.filter((s) => !s.session && s.plan?.usable);
  for (const s of ws.scenes) if (!s.session && !s.plan?.usable) waiting.push(s.scene.number);
  // In rounds (each call stops after the time budget and says how many remain; the page calls again).
  await pool(todo, async (s) => { await spotScene(db, projectId, s.scene.id); spotted.push(s.scene.number); }, 3, opts.budgetMs);
  return { spotted: spotted.sort((x, y) => x - y), waiting, already: ws.scenes.filter((s) => s.session).length, remaining: todo.length - spotted.length };
}

/**
 * Generates the planned sounds of one scene (sceneId) or of every spotted scene, scene by scene in film order.
 * Whole-film runs go through the generator's run queue (migration 0055): when it is full, this stops with `busy` and
 * says how many are left, and the page carries on as the generator catches up — never "too many in a minute".
 * The project is read once; cues already made or being made are never asked for twice.
 */
export async function generateAllCues(db: SupabaseClient, projectId: string, sceneId: string | null, env: Env = process.env, opts: Round = {}) {
  await assertProjectAccess(db, projectId);
  if (sceneId) await assertSceneInProject(db, projectId, sceneId);
  const [scenes, sessions, tracks, clips, gens] = await Promise.all([
    repo.listScenes(db, projectId), repo.listSessions(db, projectId), repo.listTracks(db, projectId), repo.listClips(db, projectId), repo.listGenerationStates(db, projectId),
  ]);
  const number = new Map(scenes.map((x) => [x.id as string, Number(x.number)]));
  const wanted = sessions.filter((s) => !sceneId || s.scene_id === sceneId).sort((a, b) => (number.get(a.scene_id) ?? 0) - (number.get(b.scene_id) ?? 0));
  const pending = new Set(gens.filter((g) => g.status !== "failed" && g.clip_id).map((g) => g.clip_id as string));
  // A cue whose sound failed twice is left for the person (it is listed in the scene's progress as failed), never retried forever.
  const failures = new Map<string, number>();
  for (const g of gens) if (g.status === "failed" && g.clip_id) failures.set(g.clip_id, (failures.get(g.clip_id) ?? 0) + 1);
  const trackOf = new Map(tracks.map((t) => [t.id as string, t]));
  const todo: { scene_id: string; clip: Row; kind: string }[] = [];
  let skipped = 0;
  for (const s of wanted) {
    for (const c of clips.filter((x) => x.session_id === s.id && x.kind === "cue")) {
      const kind = FAMILY_KIND[trackOf.get(c.track_id)?.family];
      if (!kind || (kind === "voice" && !c.source?.dialogue_line_id)) continue;
      if (pending.has(c.id)) continue;
      if ((failures.get(c.id) ?? 0) >= 2) { skipped++; continue; }
      if (!audioBackendsFor(kind, env)[0]) { skipped++; continue; }
      todo.push({ scene_id: s.scene_id as string, clip: c, kind });
    }
  }
  let requested = 0, busy = false;
  const failed: string[] = [];
  await pool(todo, async (x) => {
    if (busy) return;
    try {
      await generateSound(db, projectId, x.scene_id, cueRequest(x.clip, x.kind), env, { batch: true, checked: true });
      requested++;
    } catch (e) {
      if (e instanceof AudioBusyError) { busy = true; return; }
      failed.push(`Scene ${number.get(x.scene_id) ?? "?"} · ${x.clip.label}: ${(e as Error).message}`);
    }
  }, 4, opts.budgetMs);
  const making = gens.filter((g) => g.status === "queued" || g.status === "running").length + requested;
  return { scenes: wanted.length, requested, skipped, remaining: todo.length - requested - failed.length, busy, making, failed: failed.slice(0, 10) };
}

/**
 * Puts each finished generated sound on the planned cue it was made for (the newest finished take when there are
 * several). Clips that already hold a recording are never touched; cues whose sound is still being made are counted.
 */
export async function placeGenerated(db: SupabaseClient, projectId: string, sceneId: string | null, opts: Round = {}) {
  await assertProjectAccess(db, projectId);
  if (sceneId) await assertSceneInProject(db, projectId, sceneId);
  const [sessions, clips, gens] = await Promise.all([repo.listSessions(db, projectId), repo.listClips(db, projectId), repo.listGenerationStates(db, projectId)]);
  const sessionIds = new Set(sessions.filter((s) => !sceneId || s.scene_id === sceneId).map((s) => s.id as string));
  const newest = new Map<string, Row>();
  const making = new Set<string>();
  for (const g of [...gens].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))) {
    if (!g.clip_id) continue;
    if (g.status === "succeeded" && g.asset_id && !newest.has(g.clip_id)) newest.set(g.clip_id, g);
    if (g.status === "queued" || g.status === "running") making.add(g.clip_id);
  }
  const cues = clips.filter((x) => sessionIds.has(x.session_id) && x.kind === "cue");
  const todo = cues.filter((c) => newest.has(c.id));
  const stillMaking = cues.filter((c) => !newest.has(c.id) && making.has(c.id)).length;
  const nothingYet = cues.length - todo.length - stillMaking;
  const placed = await pool(todo, async (c) => { await updateClip(db, c.id, { asset_id: newest.get(c.id)!.asset_id, label: String(c.label).slice(0, 200) }); }, 6, opts.budgetMs);
  return { placed, remaining: todo.length - placed, still_making: stillMaking, not_generated: nothingYet };
}
