// apps/api/src/modules/generation/generation.batch.ts
// One click for the whole film (owner, 2026-10-02), in the page's order: compile every shot's prompt, sketch every shot
// with the built-in AuraStage Sketch (free — so the film can be tested end to end before any paid image or video
// provider has credit), and approve a finished take for every shot that has none. Each step goes through the same
// gated, per-shot functions as the buttons on each shot, so everything stays editable one by one, and nothing a person
// approved or rejected is changed (rule 11).
//
// Speed (owner report 2026-10-02: compile-all on a 69-shot film ran 84 s and was cut off): the project is read ONCE,
// shots are worked on several at a time, and each call stops after a time budget and says how many remain — the page
// calls again until none do, showing progress. No call can run into the proxy's time limit.
import type { SupabaseClient } from "@supabase/supabase-js";
import { readProjectSettings } from "../settings/settings.read";
import { refreshShotPlanReview } from "../shots/shots.service";
import { assertProjectAccess } from "./generation.permissions";
import * as repo from "./generation.repository";
import { compileWithContext, loadCompileContext, norm, packageReview, planUsable, requestTakes, setTakeApproval, type WorldRevisions } from "./generation.service";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
const BUDGET_MS = 25_000;

/** Runs `fn` over items, `size` at a time, until done or the time budget is spent; returns how many ran. */
async function pool<T>(items: T[], fn: (item: T) => Promise<void>, size = 6, budgetMs = BUDGET_MS) {
  const t0 = Date.now();
  let i = 0, done = 0;
  const worker = async () => {
    while (i < items.length && Date.now() - t0 < budgetMs) {
      const it = items[i++];
      await fn(it);
      done++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return done;
}

/** Usable plans' shots with their newest package's review state and their takes — no signed links, no per-shot reads. */
async function lightState(db: SupabaseClient, projectId: string) {
  await refreshShotPlanReview(db, projectId);
  const [current, scenes, plans, versions, packages, takes, worldItems] = await Promise.all([
    readProjectSettings(db, projectId), repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listPlanVersions(db, projectId),
    repo.listPackages(db, projectId), repo.listTakes(db, projectId), repo.listWorldItems(db, projectId),
  ]);
  const look = norm(current.settings.style.look);
  const world: WorldRevisions = new Map([...worldItems.locations, ...worldItems.props].filter((x) => !x.archived_at).map((x) => [x.id as string, { name: x.name as string, revision: Number(x.revision) }]));
  const shots: { scene: number; shot: Row; pkg: Row | null; pkgCurrent: boolean; takes: Row[] }[] = [];
  const waiting: number[] = [];
  for (const scene of [...scenes].sort((a, b) => a.number - b.number)) {
    const plan = plans.find((p) => p.scene_id === scene.id);
    const version = plan?.approved_version_id ? versions.find((v) => v.id === plan.approved_version_id) : undefined;
    if (!plan || !version) continue;
    if (!planUsable(plan)) { waiting.push(scene.number); continue; }
    for (const shot of (version.shots as Row[]) ?? []) {
      const pkg = packages.find((p) => p.shot_id === shot.id) ?? null; // newest first
      const pkgCurrent = !!pkg && packageReview(pkg, plan, version.version_number, look, world).state === "current";
      shots.push({ scene: scene.number, shot, pkg, pkgCurrent, takes: takes.filter((t) => t.shot_id === shot.id) });
    }
  }
  return { shots, waiting, aspect: current.settings.technical.aspect_ratio as string };
}

/** Compiles every shot of every usable plan whose prompt is missing or needs review (in rounds; `remaining` > 0 → call again). */
export async function compileAllShots(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const st = await lightState(db, projectId);
  const todo = st.shots.filter((x) => !x.pkgCurrent);
  if (!todo.length) return { compiled: 0, remaining: 0, already: st.shots.length, waiting_scenes: st.waiting };
  const ctx = await loadCompileContext(db, projectId);
  const failed: string[] = [];
  const compiled = await pool(todo, async (x) => {
    try { await compileWithContext(db, ctx, x.shot.id, st.aspect); }
    catch (e) { failed.push(`scene ${x.scene} shot ${x.shot.ordinal}: ${(e as Error).message}`); }
  });
  return { compiled: compiled - failed.length, remaining: todo.length - compiled, already: st.shots.length - todo.length, waiting_scenes: st.waiting, failed: failed.slice(0, 10) };
}

/** One free AuraStage Sketch for every shot with a current prompt and no take made or being made. */
export async function sketchAllShots(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  const st = await lightState(db, projectId);
  const needs_prompt = st.shots.filter((x) => !x.pkgCurrent).length;
  const ready = st.shots.filter((x) => x.pkgCurrent);
  const todo = ready.filter((x) => !x.takes.some((t) => t.status === "queued" || t.status === "running" || t.status === "succeeded"));
  const requested = await pool(todo, async (x) => {
    await requestTakes(db, x.pkg!.id, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 1 }, `sketchall_${x.pkg!.id}_${x.takes.length}`, env);
  });
  return { requested, remaining: todo.length - requested, already: ready.length - todo.length, needs_prompt };
}

/** Approves the newest finished, not-rejected take of every shot that has no approved take. */
export async function approveAllShots(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  const st = await lightState(db, projectId);
  const open = st.shots.filter((x) => !x.takes.some((t) => t.approval === "approved"));
  const pick = (x: (typeof open)[number]) => x.takes.filter((t) => t.status === "succeeded" && t.approval !== "rejected").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const todo = open.filter((x) => pick(x));
  const approved = await pool(todo, async (x) => { await setTakeApproval(db, pick(x).id, "approve", env); });
  return { approved, remaining: todo.length - approved, waiting: open.length - todo.length, total: st.shots.length };
}
