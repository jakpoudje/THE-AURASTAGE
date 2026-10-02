// apps/api/src/modules/runs/runs.service.ts
// Production runs (MOS, migration 0056 — owner request 2026-10-02): whole-film work in Audio Studio and Visual Generation
// done in batches, scene by scene, with everyone on the project able to see exactly what is happening.
//
// A run never does anything a person couldn't do with the buttons: each round calls the same permission-checked,
// version-aware batch functions (audio.batch, generation.batch) with a share of a ~25 s budget, so no request runs into
// the proxy's time limit (rule 8: the heavy work itself — making sounds and pictures — is done by the workers). A short
// lease means only one open page drives a run at a time; when nobody has the page open the run simply waits, and the
// next page that opens carries it on. Generation is bounded by the run queue (migration 0055), so a run never floods the
// generator or holds up someone's own request.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ControlRunSchema, ProductionRunSchema, RUN_PHASES, StartRunSchema, type ProductionRun, type RunKind } from "@aurastage/contracts";
import { generateAllCues, placeGenerated, spotAllScenes } from "../audio/audio.batch";
import { approveAllShots, compileAllShots, sketchAllShots } from "../generation/generation.batch";
import * as repo from "./runs.repository";
import { RunForbiddenError, RunNotFoundError, RunValidationError } from "./runs.errors";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A running run nobody has carried on for this long is shown as waiting for an open page. */
const IDLE_MS = 90_000;

export function toRunDTO(r: Row, now = Date.now()): ProductionRun {
  const idle = r.status === "running" && now - new Date(r.updated_at).getTime() > IDLE_MS && (!r.lease_until || new Date(r.lease_until).getTime() < now);
  // A run that hasn't had its first round yet is on its first step (the database starts every run at 'start'), so the
  // steps list shows "1 · Spot scenes" (or "Compile prompts") as current from the moment it starts.
  const phases = (RUN_PHASES as Record<string, readonly string[]>)[r.kind] ?? [];
  const phase = phases.includes(r.phase) || !phases.length ? r.phase : phases[0];
  const progress = { ...(r.progress ?? {}) } as Row;
  if (!Array.isArray(progress.phases) && phases.length) Object.assign(progress, { phases: [...phases], phase_index: Math.max(0, phases.indexOf(phase)) });
  return ProductionRunSchema.parse({
    id: r.id, project_id: r.project_id, area: r.area, kind: r.kind, scene_id: r.scene_id ?? null, status: r.status, phase,
    message: r.message ?? null, progress, log: Array.isArray(r.log) ? r.log.map((x: Row) => ({ at: String(x.at), text: String(x.text) })) : [],
    rounds: Number(r.rounds ?? 0), started_by_label: r.started_by_label ?? null, started_at: String(r.started_at), updated_at: String(r.updated_at),
    finished_at: r.finished_at ? String(r.finished_at) : null, idle,
  });
}

async function projectVisible(db: SupabaseClient, projectId: string) {
  if (!UUID_RE.test(projectId)) throw new RunForbiddenError();
  const { data, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RunForbiddenError();
}

export async function listProjectRuns(db: SupabaseClient, projectId: string) {
  await projectVisible(db, projectId);
  const runs = (await repo.listRuns(db, projectId)).map((r) => toRunDTO(r));
  return {
    runs,
    active: { audio: runs.find((r) => r.area === "audio" && (r.status === "running" || r.status === "paused")) ?? null, visual: runs.find((r) => r.area === "visual" && (r.status === "running" || r.status === "paused")) ?? null },
  };
}

export async function startRun(db: SupabaseClient, projectId: string, payload: unknown) {
  await projectVisible(db, projectId);
  const p = StartRunSchema.safeParse(payload ?? {});
  if (!p.success) throw new RunValidationError(p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), p.error.issues);
  if (p.data.kind.startsWith("visual.") && p.data.scene_id) throw new RunValidationError("Visual runs work on the whole film — use a shot's own buttons for one scene.");
  const r = await repo.startRun(db, projectId, p.data.kind, p.data.scene_id ?? null);
  return { run: toRunDTO(r.run), joined: r.joined };
}

export async function controlRun(db: SupabaseClient, runId: string, payload: unknown) {
  if (!UUID_RE.test(runId)) throw new RunNotFoundError("Run not found");
  const p = ControlRunSchema.safeParse(payload ?? {});
  if (!p.success) throw new RunValidationError("Choose pause, resume or stop");
  return { run: toRunDTO(await repo.controlRun(db, runId, p.data.action)) };
}

type Outcome = { phase: string; done: boolean; message: string; log: string | null; wait_ms: number; last: Row };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One round of an audio run. */
async function audioRound(db: SupabaseClient, run: Row, env: Env): Promise<Outcome> {
  const kind = run.kind as RunKind, scene = (run.scene_id as string | null) ?? null, pid = run.project_id as string;
  const phase = RUN_PHASES[kind].includes(run.phase) ? run.phase : RUN_PHASES[kind][0];
  if (phase === "spot" && scene) {
    // One scene: spotting it is the scene's own button; the run starts at its sounds.
    return { phase: "generate", done: false, message: "Starting on this scene's planned sounds.", log: null, wait_ms: 0, last: {} };
  }
  if (phase === "spot") {
    const r = await spotAllScenes(db, pid, { budgetMs: 22_000 });
    const msg = `${r.spotted.length ? `Spotted scene${r.spotted.length === 1 ? "" : "s"} ${r.spotted.join(", ")}. ` : ""}${r.remaining ? `${plural(r.remaining, "scene")} still to spot.` : "Every scene with an approved shot plan is spotted."}${r.waiting.length ? ` Waiting for a shot plan: ${r.waiting.join(", ")}.` : ""}`;
    const done = !r.remaining;
    return { phase: done && kind === "audio.film" ? "generate" : "spot", done: done && kind === "audio.spot", message: msg, log: r.spotted.length ? `Spotted ${r.spotted.join(", ")}` : null, wait_ms: 0, last: r };
  }
  if (phase === "generate") {
    const g = await generateAllCues(db, pid, scene, env, { budgetMs: kind === "audio.film" ? 15_000 : 22_000 });
    // In a whole-film run, sounds that are ready go onto their spots straight away — scenes finish one after another.
    const p = kind === "audio.film" ? await placeGenerated(db, pid, scene, { budgetMs: 7_000 }) : null;
    const parts = [
      g.requested ? `Asked the generator for ${plural(g.requested, "sound")}.` : "",
      g.remaining ? `${plural(g.remaining, "planned sound")} still to ask for${g.busy ? " — waiting for the generator to make the ones already queued (it takes a person's own requests first)" : ""}.` : "Every planned sound has been asked for.",
      `${g.making} being made now.`,
      p?.placed ? `Placed ${plural(p.placed, "finished sound")} on ${p.placed === 1 ? "its" : "their"} marked spot${p.placed === 1 ? "" : "s"}.` : "",
      g.failed.length ? `Couldn't ask for ${g.failed.length}: ${g.failed.slice(0, 2).join("; ")}.` : "",
    ].filter(Boolean);
    const done = !g.remaining;
    return {
      phase: done && kind === "audio.film" ? "finish" : "generate", done: done && kind === "audio.generate", message: parts.join(" "),
      log: g.requested || p?.placed ? `Asked for ${g.requested}${p?.placed ? `, placed ${p.placed}` : ""}` : g.busy ? "Waiting for the generator" : null,
      wait_ms: g.busy ? 5_000 : 0, last: { generate: g, place: p },
    };
  }
  // place / finish: put finished sounds on their spots; a whole-film run waits for the ones still being made.
  const p = await placeGenerated(db, pid, scene, { budgetMs: 22_000 });
  const waitForMaking = kind === "audio.film" && p.still_making > 0;
  const done = !p.remaining && !waitForMaking;
  const msg = `${p.placed ? `Placed ${plural(p.placed, "sound")} on ${p.placed === 1 ? "its" : "their"} marked spot${p.placed === 1 ? "" : "s"}. ` : ""}${p.still_making ? `${plural(p.still_making, "sound")} still being made${waitForMaking ? " — each is placed as it finishes" : " — run “Place” again when they're ready"}. ` : ""}${p.not_generated ? `${plural(p.not_generated, "planned cue")} without a generated sound (no voice or effect for it yet — upload or generate it by hand).` : ""}`.trim() || "Every finished sound is on its spot.";
  return { phase, done, message: done ? `Done. ${msg}` : msg, log: p.placed ? `Placed ${p.placed}` : null, wait_ms: waitForMaking && !p.placed ? 4_000 : 0, last: p };
}

/** One round of a visual run. */
async function visualRound(db: SupabaseClient, run: Row, env: Env): Promise<Outcome> {
  const kind = run.kind as RunKind, pid = run.project_id as string;
  const phase = RUN_PHASES[kind].includes(run.phase) ? run.phase : RUN_PHASES[kind][0];
  const film = kind === "visual.film";
  if (phase === "compile") {
    const c = await compileAllShots(db, pid, { budgetMs: film ? 14_000 : 22_000 });
    const s = film && c.compiled ? await sketchAllShots(db, pid, env, { budgetMs: 6_000 }) : null;
    const done = !c.remaining;
    const msg = `${c.compiled ? `Compiled ${plural(c.compiled, "prompt")}. ` : ""}${c.remaining ? `${plural(c.remaining, "shot")} still to compile.` : "Every shot's prompt is current."}${s?.requested ? ` Started ${plural(s.requested, "sketch", "sketches")} for the shots that are ready.` : ""}${c.failed?.length ? ` Couldn't compile ${c.failed.length}: ${c.failed.slice(0, 2).join("; ")}.` : ""}${c.waiting_scenes.length ? ` Waiting for a shot plan: scenes ${c.waiting_scenes.slice(0, 12).join(", ")}${c.waiting_scenes.length > 12 ? "…" : ""}.` : ""}`;
    return { phase: done && film ? "make" : "compile", done: done && !film, message: msg, log: c.compiled ? `Compiled ${c.compiled}` : null, wait_ms: 0, last: { compile: c, sketch: s } };
  }
  if (phase === "make" || phase === "sketch") {
    const s = await sketchAllShots(db, pid, env, { budgetMs: film ? 14_000 : 22_000 });
    const a = film ? await approveAllShots(db, pid, env, { budgetMs: 7_000 }) : null;
    const done = !s.remaining;
    const msg = [
      s.requested ? `Started ${plural(s.requested, "free sketch", "free sketches")}.` : "",
      s.remaining ? `${plural(s.remaining, "shot")} still to start${s.busy ? " — waiting for the generator to finish the ones already queued (a person's own requests go first)" : ""}.` : "Every shot with a prompt has a take made or being made.",
      `${s.making} being made now.`,
      a?.approved ? `Approved ${plural(a.approved, "finished take")}.` : "",
      s.needs_prompt ? `${plural(s.needs_prompt, "shot")} still need a prompt.` : "",
      s.failed.length ? `Couldn't start ${s.failed.length}: ${s.failed.slice(0, 2).join("; ")}.` : "",
    ].filter(Boolean).join(" ");
    return {
      phase: done && film ? "finish" : phase, done: done && !film, message: msg,
      log: s.requested || a?.approved ? `Started ${s.requested}${a?.approved ? `, approved ${a.approved}` : ""}` : s.busy ? "Waiting for the generator" : null,
      wait_ms: s.busy ? 5_000 : 0, last: { sketch: s, approve: a },
    };
  }
  // approve / finish
  const a = await approveAllShots(db, pid, env, { budgetMs: 22_000 });
  const waitForMaking = film && a.making > 0;
  const done = !a.remaining && !waitForMaking;
  const msg = `${a.approved ? `Approved ${plural(a.approved, "take")}. ` : ""}${a.making ? `${plural(a.making, "take")} still being made${film ? " — each is approved as it finishes" : ""}. ` : ""}${a.waiting ? `${plural(a.waiting, "shot")} without a finished take yet.` : ""}`.trim() || "Every shot has an approved take.";
  return { phase, done, message: done ? `Done. ${msg}` : msg, log: a.approved ? `Approved ${a.approved}` : null, wait_ms: waitForMaking && !a.approved ? 4_000 : 0, last: a };
}

/**
 * One round of a run, by whichever page holds its lease. Returns the run as it now stands, whether this page drove it,
 * and how long to wait before the next round (the generator is catching up).
 */
export async function stepRun(db: SupabaseClient, runId: string, env: Env = process.env) {
  if (!UUID_RE.test(runId)) throw new RunNotFoundError("Run not found");
  const before = await repo.getRun(db, runId);
  if (!before) throw new RunNotFoundError("Run not found");
  if (before.status !== "running") return { run: toRunDTO(before), driving: false, wait_ms: 0 };
  if (!(await repo.leaseRun(db, runId, 45))) return { run: toRunDTO(before), driving: false, wait_ms: 3_000 };
  const errors = Number(before.progress?.errors ?? 0);
  try {
    const o = before.area === "audio" ? await audioRound(db, before, env) : await visualRound(db, before, env);
    const saved = await repo.saveRun(db, runId, {
      phase: o.phase, status: o.done ? "completed" : "running", message: o.message,
      progress: { phases: RUN_PHASES[before.kind as RunKind], phase_index: Math.max(0, RUN_PHASES[before.kind as RunKind].indexOf(o.phase)), last: o.last, errors: 0 },
      log: o.done ? `Finished — ${o.message.slice(0, 200)}` : o.log,
    });
    return { run: toRunDTO(saved), driving: true, wait_ms: o.wait_ms };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong";
    // A permission problem pauses the run for someone who may do that step; anything else is retried, three times at most.
    const forbidden = e instanceof RunForbiddenError || (e as { code?: string })?.code?.endsWith("-403");
    const status = forbidden ? "paused" : errors + 1 >= 3 ? "failed" : "running";
    const saved = await repo.saveRun(db, runId, {
      phase: before.phase, status, message: forbidden ? `Paused: ${message}` : status === "failed" ? `Stopped after repeated problems: ${message}` : `A problem in this round (trying again): ${message}`,
      progress: { ...(before.progress ?? {}), errors: errors + 1 }, log: `Problem: ${message.slice(0, 200)}`,
    });
    return { run: toRunDTO(saved), driving: true, wait_ms: 5_000 };
  }
}
