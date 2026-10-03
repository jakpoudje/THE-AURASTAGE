// apps/api/src/modules/shots/shots.service.ts
// Domain workflow for Storyboard & Shots (SRS §9, §9.1, §14.1 ShotPlanningReady).
// Shots are planned only from a LOCKED, current Scene DNA version; the plan
// records that version id (rule 10). When Scene DNA is locked again or needs
// review, the plan is marked stale / review_required with a reason (rule 11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { once } from "../../infrastructure/requestMemo";
import type { CoverageStyle } from "@aurastage/contracts";
import { coverageMath, coverageMathEngine, planStoryTime, shotPlanning, shotPlanningEngine } from "@aurastage/engines";
// Scene DNA owns its review state; we ask it to refresh (never write its tables).
import { refreshSceneDnaReview } from "../scene-dna/sceneDna.service";
import { assertProjectAccess, assertSceneInProject, assertShotAccess } from "./shots.permissions";
import * as repo from "./shots.repository";
import { toPlanDTO, toShotDTO } from "./shots.mapper";
import { ShotNotReadyError, validateAdd, validateCreateShot, validateGenerate, validateGenerateAll, validateMove, validateUpdateShot } from "./shots.validator";

export const PLANNING_ENGINE_VERSION = shotPlanning.ENGINE_VERSION;
export const COVERAGE_ENGINE_VERSION = coverageMath.ENGINE_VERSION;

type Row = Record<string, any>;

async function load(db: SupabaseClient, projectId: string) {
  // Propagate upstream changes (script/Casting/Dialogue -> Scene DNA) before we read Scene DNA state.
  await refreshSceneDnaReview(db, projectId);
  const [scenes, dna, dnaVersions, lines, chars, plans, shots, planVersions, genre] = await Promise.all([
    repo.listScenes(db, projectId),
    repo.listSceneDna(db, projectId),
    repo.listDnaVersions(db, projectId),
    repo.listLines(db, projectId),
    repo.listCharacters(db, projectId),
    repo.listPlans(db, projectId),
    repo.listShots(db, projectId),
    repo.listPlanVersions(db, projectId),
    repo.getProjectGenre(db, projectId),
  ]);
  return {
    genre,
    scenes,
    dna: new Map(dna.map((d) => [d.scene_id as string, d])),
    dnaVersions: new Map(dnaVersions.map((v) => [v.id as string, v])),
    lines: new Map(lines.map((l) => [l.id as string, l])),
    charName: new Map(chars.map((c) => [c.id as string, c.name as string])),
    plans: new Map(plans.map((p) => [p.scene_id as string, p])),
    shots,
    planVersions: new Map(planVersions.map((v) => [v.id as string, v])),
  };
}
type Loaded = Awaited<ReturnType<typeof load>>;

/** What the locked Scene DNA version says about this scene (never the live draft). */
function lockedDna(u: Loaded, scene: Row) {
  const d = u.dna.get(scene.id);
  const v = d?.approved_version_id ? u.dnaVersions.get(d.approved_version_id) : undefined;
  if (!d || !v) return null;
  const content = (v.content ?? {}) as Row;
  const proposal = (content.proposal ?? {}) as Row;
  const editable = (content.editable ?? {}) as Row;
  const lineIds: string[] = proposal.dialogue?.line_ids ?? [];
  const lines = lineIds.map((id) => u.lines.get(id)).filter((l): l is Row => !!l);
  const participants: Row[] = proposal.participants ?? [];
  const current = d.status === "approved" && d.review_state === "current";
  return {
    record: d,
    version: v,
    current,
    duration: Number(proposal.narrative?.intended_duration_seconds ?? scene.estimated_seconds ?? 0) || 1,
    editable,
    participants,
    lines,
    lineIds,
  };
}

const lineLabel = (l: Row) => `${l.speaker_name}: “${String(l.text).length > 40 ? String(l.text).slice(0, 37) + "…" : l.text}”`;

function planReview(u: Loaded, plan: Row, dna: ReturnType<typeof lockedDna>): { state: string; reason: string | null } {
  const d = u.dna.get(plan.scene_id);
  if (!dna || !d) return { state: "stale", reason: "This scene's Scene DNA is no longer locked." };
  if (d.approved_version_id !== plan.scene_dna_version_id) {
    return { state: "stale", reason: `Scene DNA was locked again (now version ${dna.version.version_number}) after these shots were planned.` };
  }
  if (d.review_state !== "current") {
    const first = Array.isArray(d.drift) && d.drift[0]?.message ? ` ${d.drift[0].message}` : "";
    return { state: "review_required", reason: `Scene DNA needs review.${first}` };
  }
  if (d.status !== "approved") return { state: "review_required", reason: "Scene DNA has edits that aren't locked yet." };
  return { state: "current", reason: null };
}

function coverageFor(dna: NonNullable<ReturnType<typeof lockedDna>>, shots: Row[]) {
  return coverageMathEngine({
    scene_seconds: planStoryTime(dna.duration, dna.lines.map((l) => Number(l.estimated_seconds))),
    shots: shots.map((s) => ({
      id: s.id,
      ordinal: s.ordinal,
      purpose: s.purpose,
      duration_seconds: Number(s.duration_seconds),
      story_start: Number(s.story_start),
      story_end: Number(s.story_end),
      character_ids: s.character_ids ?? [],
      dialogue_line_ids: s.dialogue_line_ids ?? [],
    })),
    line_ids: dna.lineIds,
    line_labels: Object.fromEntries(dna.lines.map((l) => [l.id, lineLabel(l)])),
    characters: dna.participants.filter((p) => p.presence === "on_screen").map((p) => ({ id: p.character_id, name: p.name })),
  });
}

/**
 * Brings every shot plan's review state up to date with Scene DNA (which is
 * itself refreshed first). Downstream domains (Visual Generation) call this
 * before reading plan state; Storyboard still owns all its own writes.
 */
export function refreshShotPlanReview(db: SupabaseClient, projectId: string) {
  return once(db, `refreshShotPlanReview:${projectId}`, () => refreshShotPlanReviewNow(db, projectId));
}
async function refreshShotPlanReviewNow(db: SupabaseClient, projectId: string) {
  const u = await load(db, projectId);
  for (const scene of u.scenes) {
    const plan = u.plans.get(scene.id);
    if (!plan) continue;
    const r = planReview(u, plan, lockedDna(u, scene));
    if (plan.review_state !== r.state || (plan.review_reason ?? null) !== r.reason) await repo.setReview(db, plan.id, r.state, r.reason);
  }
}

export async function getStoryboard(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const u = await load(db, projectId);
  const visible = u.scenes.filter((s) => s.status === "active" || u.plans.has(s.id));
  const out = [];
  for (const scene of visible) {
    const dna = lockedDna(u, scene);
    let plan = u.plans.get(scene.id) ?? null;
    if (plan) {
      const r = planReview(u, plan, dna);
      if (plan.review_state !== r.state || (plan.review_reason ?? null) !== r.reason) plan = await repo.setReview(db, plan.id, r.state, r.reason);
    }
    const shots = plan ? u.shots.filter((s) => s.plan_id === plan!.id) : [];
    out.push({
      scene: { id: scene.id, number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day, status: scene.status },
      dna: dna
        ? {
            state: dna.current ? "locked" : "needs_review",
            version_id: dna.version.id,
            version_number: dna.version.version_number,
            duration_seconds: dna.duration,
            mood: dna.editable.mood ?? [],
            camera_energy: dna.editable.camera_energy ?? null,
          }
        : { state: "not_locked", version_id: null, version_number: null, duration_seconds: null, mood: [], camera_energy: null },
      characters: dna ? dna.participants.map((p) => ({ id: p.character_id, name: u.charName.get(p.character_id) ?? p.name, presence: p.presence })) : [],
      lines: dna ? dna.lines.map((l) => ({ id: l.id, label: lineLabel(l), character_id: l.character_id })) : [],
      plan: plan
        ? toPlanDTO(plan, plan.approved_version_id ? Number(u.planVersions.get(plan.approved_version_id)?.version_number ?? null) : null)
        : null,
      shots: shots.map(toShotDTO),
      coverage: plan && dna ? coverageFor(dna, shots) : null,
    });
  }
  const active = out.filter((s) => s.scene.status === "active");
  return {
    scenes: out,
    summary: {
      scenes: active.length,
      dna_locked: active.filter((s) => s.dna.state === "locked").length,
      planned: active.filter((s) => s.plan).length,
      approved: active.filter((s) => s.plan?.status === "approved" && s.plan.review_state === "current").length,
      shots: out.reduce((n, s) => n + s.shots.length, 0),
      needs_review: out.filter((s) => s.plan && s.plan.review_state !== "current").length,
    },
  };
}

export async function generateShots(db: SupabaseClient, projectId: string, sceneId: string, payload: unknown) {
  const { replace, style } = validateGenerate(payload);
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const u = await load(db, projectId);
  const scene = u.scenes.find((s) => s.id === sceneId)!;
  return planScene(db, projectId, u, scene, style, replace);
}

/**
 * One click for the whole film: plans every active scene whose Scene DNA is locked and that has no shot plan yet.
 * Existing plans (approved or not) are never replaced here — they are listed as skipped, with why.
 */
export async function generateAllShots(db: SupabaseClient, projectId: string, payload: unknown) {
  const { style } = validateGenerateAll(payload);
  await assertProjectAccess(db, projectId);
  const u = await load(db, projectId);
  const planned: { scene_number: number; shots: number }[] = [];
  const skipped: { scene_number: number; reason: string }[] = [];
  const todo: Row[] = [];
  for (const scene of u.scenes.filter((s) => s.status === "active").sort((a, b) => a.number - b.number)) {
    const dna = lockedDna(u, scene);
    if (u.plans.get(scene.id)) skipped.push({ scene_number: scene.number, reason: "already has a shot plan (kept as it is)" });
    else if (!dna || !dna.current) skipped.push({ scene_number: scene.number, reason: "Scene DNA isn't locked yet" });
    else todo.push(scene);
  }
  // Several scenes at a time (regression, owner report 2026-10-01: a 69-scene film took minutes one scene after another).
  await inBatches(todo, async (scene) => { planned.push({ scene_number: scene.number, shots: (await planScene(db, projectId, u, scene, style, false)).shots }); });
  planned.sort((a, b) => a.scene_number - b.scene_number);
  return { style, planned, skipped, engine_version: PLANNING_ENGINE_VERSION };
}

/**
 * One round of a whole-film planning run (production runs, migration 0059 — owner request 2026-10-03: "a single click
 * should … plan every single shot sequentially in the background"). Plans the scenes in story order, one after another,
 * until the round's time is used: every locked scene with no shots yet and, when `replan` is on (the person confirmed it),
 * every scene whose plan a Scene DNA change flagged. Current plans — approved or edited by hand — are never touched;
 * a re-planned scene's approved version stays in its history and it is approved again by the same checks as by hand.
 */
export async function planScenesRound(db: SupabaseClient, projectId: string, opts: { replan: boolean; style?: CoverageStyle; budgetMs?: number }) {
  await assertProjectAccess(db, projectId);
  const t0 = Date.now(), budget = opts.budgetMs ?? 20_000, style = opts.style ?? "standard";
  const u = await load(db, projectId);
  const todo: { scene: Row; replace: boolean }[] = [];
  const waiting_dna: number[] = [], flagged_kept: number[] = [];
  for (const scene of u.scenes.filter((s) => s.status === "active").sort((a, b) => a.number - b.number)) {
    const dna = lockedDna(u, scene), plan = u.plans.get(scene.id);
    const hasShots = !!plan && u.shots.some((x) => x.plan_id === plan.id);
    const flagged = !!plan && planReview(u, plan, dna).state !== "current";
    if (hasShots && !flagged) continue;
    if (!dna || !dna.current) { waiting_dna.push(scene.number); continue; }
    if (hasShots && flagged && !opts.replan) { flagged_kept.push(scene.number); continue; }
    todo.push({ scene, replace: hasShots });
  }
  const planned: { scene_number: number; shots: number; replanned: boolean }[] = [];
  const failed: string[] = [];
  for (const { scene, replace } of todo) {
    if (planned.length && Date.now() - t0 > budget) break;
    try {
      planned.push({ scene_number: scene.number, shots: (await planScene(db, projectId, u, scene, style, replace)).shots, replanned: replace });
    } catch (e) {
      if ((e as { code?: string })?.code?.endsWith("-403") || (e as { message?: string })?.message?.includes("AURA-COL-403")) throw e;
      failed.push(`Scene ${scene.number}: ${e instanceof Error ? e.message : "couldn't plan"}`);
    }
  }
  return { style, planned, remaining: todo.length - planned.length - failed.length, failed, waiting_dna, flagged_kept, engine_version: PLANNING_ENGINE_VERSION };
}

/** Every scene's planning stage, counted from the records (rule 12) — for the run panel on Storyboard & Shots. */
export async function getStoryboardProgress(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const u = await load(db, projectId);
  const totals = { scenes: 0, dna_locked: 0, planned: 0, approved: 0, review: 0, shots: 0 };
  const scenes = u.scenes.filter((s) => s.status === "active").sort((a, b) => a.number - b.number).map((scene) => {
    const dna = lockedDna(u, scene), plan = u.plans.get(scene.id);
    const shots = plan ? u.shots.filter((x) => x.plan_id === plan.id).length : 0;
    const review = plan && shots ? planReview(u, plan, dna) : null;
    const approved = !!plan && shots > 0 && plan.status === "approved" && review?.state === "current";
    const counts = { approved: approved ? 1 : 0, planned: shots && !approved && review?.state === "current" ? 1 : 0, review: review && review.state !== "current" ? 1 : 0, shots };
    totals.scenes++; totals.shots += shots;
    if (dna?.current) totals.dna_locked++;
    totals.planned += shots ? 1 : 0; totals.approved += counts.approved; totals.review += counts.review;
    const [stage, label] = !dna?.current ? ["needs_plan", shots ? "Scene DNA changed — lock it again to re-plan" : "Lock its Scene DNA first"]
      : approved ? ["approved", `Approved — ${shots} shot${shots === 1 ? "" : "s"}`]
      : counts.review ? ["review", `Needs re-planning: ${review!.reason ?? "Scene DNA changed"}`]
      : shots ? ["planned", `Planned — ${shots} shot${shots === 1 ? "" : "s"}, waiting for approval`]
      : ["ready", "Ready to plan"];
    return { scene_id: scene.id as string, number: scene.number as number, heading: scene.heading as string, stage, label, pct: approved ? 100 : counts.planned ? 50 : 0, counts };
  });
  return { scenes, totals, generator: { queued: 0, running: 0, run_queue: 0 }, at: new Date().toISOString() };
}

/** Runs `fn` over `items`, `size` at a time (independent scenes; each write is its own transaction). */
async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>, size = 6) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Approves every shot plan that is ready (owner report 2026-10-01: 62 of 69 plans sat "in progress" because approval
 * was one scene at a time). The same checks as approving one scene: the plan must be current against its locked Scene
 * DNA and pass the blocking coverage checks; everything else is listed with why, never approved.
 */
export async function approveAllShotPlans(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const u = await load(db, projectId);
  const approved: { scene_number: number; version_number: number }[] = [];
  const skipped: { scene_number: number; reason: string }[] = [];
  const todo: { scene: Row; coverage: ReturnType<typeof coverageFor> }[] = [];
  for (const scene of u.scenes.filter((s) => s.status === "active").sort((a, b) => a.number - b.number)) {
    const plan = u.plans.get(scene.id);
    const dna = lockedDna(u, scene);
    if (!plan || !dna) { skipped.push({ scene_number: scene.number, reason: "no shot plan yet" }); continue; }
    const review = planReview(u, plan, dna);
    if (review.state !== "current") { skipped.push({ scene_number: scene.number, reason: review.reason ?? "needs review first" }); continue; }
    if (plan.status === "approved") continue;
    const coverage = coverageFor(dna, u.shots.filter((x) => x.plan_id === plan.id));
    if (!coverage.ready_for_approval) {
      skipped.push({ scene_number: scene.number, reason: `not ready: ${coverage.readiness.filter((r) => r.blocking && !r.ok).map((f) => f.label.toLowerCase()).join("; ")}` });
      continue;
    }
    todo.push({ scene, coverage });
  }
  await inBatches(todo, async ({ scene, coverage }) => {
    const v = await repo.approvePlan(db, projectId, scene.id, coverage);
    approved.push({ scene_number: scene.number, version_number: v.version_number });
  });
  approved.sort((a, b) => a.scene_number - b.scene_number);
  return { approved, skipped };
}

async function planScene(db: SupabaseClient, projectId: string, u: Awaited<ReturnType<typeof load>>, scene: Awaited<ReturnType<typeof load>>["scenes"][number], style: CoverageStyle, replace: boolean) {
  const dna = lockedDna(u, scene);
  if (!dna || !dna.current) throw new ShotNotReadyError("Lock this scene's Scene DNA first — shots are planned from a locked version.");
  const { shots, camera } = shotPlanningEngine({
    scene: { number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day, duration_seconds: dna.duration },
    dna: { camera_energy: dna.editable.camera_energy ?? null, mood: dna.editable.mood ?? [], lighting_intent: dna.editable.lighting_intent ?? null,
      purpose: dna.editable.purpose ?? null, atmosphere: dna.editable.atmosphere ?? null },
    genre: u.genre,
    participants: dna.participants.map((p) => ({ character_id: p.character_id, name: u.charName.get(p.character_id) ?? p.name, presence: p.presence })),
    lines: dna.lines.map((l) => ({
      id: l.id,
      character_id: l.character_id,
      speaker: l.speaker_name,
      text: l.text,
      estimated_seconds: Number(l.estimated_seconds),
      intensity: l.intensity,
      listener_ids: l.listener_ids ?? [],
    })),
    style,
  });
  const rows = shots.map(({ rationale, ...s }) => ({ ...s, notes: s.notes ?? rationale }));
  const plan = await repo.generatePlan(db, projectId, scene.id, dna.version.id, rows, PLANNING_ENGINE_VERSION, replace);
  return { plan_id: plan.id, shots: rows.length, scene_dna_version_number: dna.version.version_number, style, camera };
}

export async function addShot(db: SupabaseClient, projectId: string, sceneId: string, payload: unknown) {
  const { shot, after_ordinal } = validateAdd(payload);
  const input = validateCreateShot(shot);
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  return toShotDTO(await repo.addShot(db, projectId, sceneId, input, after_ordinal));
}

export async function updateShot(db: SupabaseClient, shotId: string, payload: unknown) {
  const input = validateUpdateShot(payload);
  await assertShotAccess(db, shotId);
  return toShotDTO(await repo.updateShot(db, shotId, input));
}

export async function deleteShot(db: SupabaseClient, shotId: string) {
  await assertShotAccess(db, shotId);
  return { deleted_ordinal: await repo.deleteShot(db, shotId) };
}

export async function moveShot(db: SupabaseClient, shotId: string, payload: unknown) {
  const { direction } = validateMove(payload);
  await assertShotAccess(db, shotId);
  return toShotDTO(await repo.moveShot(db, shotId, direction));
}

export async function approveShotPlan(db: SupabaseClient, projectId: string, sceneId: string) {
  await assertProjectAccess(db, projectId);
  await assertSceneInProject(db, projectId, sceneId);
  const u = await load(db, projectId);
  const scene = u.scenes.find((s) => s.id === sceneId)!;
  const plan = u.plans.get(sceneId);
  const dna = lockedDna(u, scene);
  if (!plan || !dna) throw new ShotNotReadyError("Generate a shot plan for this scene first.");
  const review = planReview(u, plan, dna);
  if (review.state !== "current") throw new ShotNotReadyError(review.reason ?? "These shots need review first.");
  const coverage = coverageFor(dna, u.shots.filter((s) => s.plan_id === plan.id));
  if (!coverage.ready_for_approval) {
    const failing = coverage.readiness.filter((r) => r.blocking && !r.ok);
    throw new ShotNotReadyError(`Not ready to approve yet: ${failing.map((f) => f.label.toLowerCase()).join("; ")}.`, failing);
  }
  const v = await repo.approvePlan(db, projectId, sceneId, coverage);
  return { version_id: v.id, version_number: v.version_number, coverage: coverage.coverage };
}
