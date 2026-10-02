// apps/api/src/modules/audio/audio.progress.ts
// Where every scene's sound stands, from the records themselves (rule 12 — counted, never estimated): spotted or not,
// planned cues, sounds being made, made and waiting to be placed, placed, failed, mix approved. Light reads only, so a
// page can show it every few seconds while a production run works through the film.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertProjectAccess } from "./audio.permissions";
import * as repo from "./audio.repository";

type Row = Record<string, any>;
export interface AudioSceneProgress {
  scene_id: string; number: number; heading: string;
  stage: "needs_plan" | "ready_to_spot" | "nothing_planned" | "waiting" | "making" | "placing" | "ready_to_mix" | "approved";
  label: string; pct: number;
  counts: { total: number; placed: number; made: number; making: number; failed: number; waiting: number; muted: number };
}

const usable = (p: Row | undefined) => !!p && p.status === "approved" && p.review_state === "current" && !!p.approved_version_id;

export async function getAudioProgress(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const [scenes, plans, sessions, clips, gens] = await Promise.all([
    repo.listScenes(db, projectId), repo.listPlans(db, projectId), repo.listSessions(db, projectId), repo.listClips(db, projectId), repo.listGenerationStates(db, projectId),
  ]);
  // The newest generation of each cue says where that cue stands.
  const latest = new Map<string, Row>();
  for (const g of gens) if (g.clip_id && !latest.has(g.clip_id)) latest.set(g.clip_id, g); // newest first
  const out: AudioSceneProgress[] = [];
  for (const sc of scenes) {
    const base = { scene_id: sc.id as string, number: Number(sc.number), heading: String(sc.heading ?? "") };
    const session = sessions.find((x) => x.scene_id === sc.id);
    const zero = { total: 0, placed: 0, made: 0, making: 0, failed: 0, waiting: 0, muted: 0 };
    if (!session) {
      const ok = usable(plans.find((p) => p.scene_id === sc.id));
      out.push({ ...base, stage: ok ? "ready_to_spot" : "needs_plan", label: ok ? "Ready to spot" : "Needs an approved shot plan", pct: 0, counts: zero });
      continue;
    }
    const mine = clips.filter((c) => c.session_id === session.id);
    const k = { ...zero, total: mine.length };
    for (const c of mine) {
      if (c.muted) k.muted++;
      if (c.kind === "asset" && c.asset_id) { k.placed++; continue; }
      const g = latest.get(c.id);
      if (!g) k.waiting++;
      else if (g.status === "queued" || g.status === "running") k.making++;
      else if (g.status === "succeeded" && g.asset_id) k.made++;
      else if (g.status === "failed") k.failed++;
      else k.waiting++;
    }
    const approved = session.status === "approved" && session.review_state === "current";
    const pct = approved ? 100 : k.total ? Math.round((100 * k.placed) / k.total) : 0;
    const [stage, label]: [AudioSceneProgress["stage"], string] =
      approved ? ["approved", "Mix approved"]
      : k.making ? ["making", `Making ${k.making} sound${k.making === 1 ? "" : "s"}`]
      : k.made ? ["placing", `${k.made} made, ready to place`]
      : !k.total ? ["nothing_planned", "Spotted — nothing planned"]
      : k.placed === k.total ? ["ready_to_mix", "Every sound in place — ready to mix"]
      : ["waiting", `${k.waiting + k.failed} planned sound${k.waiting + k.failed === 1 ? "" : "s"} still to make`];
    out.push({ ...base, stage, label, pct, counts: k });
  }
  const sum = (f: (x: AudioSceneProgress) => number) => out.reduce((n, x) => n + f(x), 0);
  const totals = {
    scenes: out.length, spotted: out.filter((x) => !["needs_plan", "ready_to_spot"].includes(x.stage)).length, approved: out.filter((x) => x.stage === "approved").length,
    clips: sum((x) => x.counts.total), placed: sum((x) => x.counts.placed), made: sum((x) => x.counts.made), making: sum((x) => x.counts.making),
    failed: sum((x) => x.counts.failed), waiting: sum((x) => x.counts.waiting),
  };
  const generator = { queued: gens.filter((g) => g.status === "queued").length, running: gens.filter((g) => g.status === "running").length, run_queue: gens.filter((g) => g.batch && (g.status === "queued" || g.status === "running")).length };
  return { scenes: out, totals, generator, at: new Date().toISOString() };
}
