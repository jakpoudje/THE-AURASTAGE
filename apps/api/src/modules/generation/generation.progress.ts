// apps/api/src/modules/generation/generation.progress.ts
// Where every scene's pictures stand, from the records themselves (rule 12): shots in the approved plan, prompts that are
// current, takes being made, shots with a finished take, shots with an approved take, failures. Uses the same light
// state as the whole-film buttons (generation.batch), so the numbers match what a run does next.
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertProjectAccess } from "./generation.permissions";
import * as repo from "./generation.repository";
import { lightState } from "./generation.batch";

export interface VisualSceneProgress {
  scene_id: string | null; number: number; heading: string;
  stage: "needs_plan" | "compiling" | "ready_to_make" | "making" | "to_approve" | "approved";
  label: string; pct: number;
  counts: { shots: number; prompts: number; making: number; made: number; approved: number; failed: number };
}

export async function getVisualProgress(db: SupabaseClient, projectId: string) {
  await assertProjectAccess(db, projectId);
  const [st, scenes] = await Promise.all([lightState(db, projectId), repo.listScenes(db, projectId)]);
  const out: VisualSceneProgress[] = [];
  for (const sc of scenes) {
    const n = Number(sc.number);
    const shots = st.shots.filter((x) => x.scene === n);
    const base = { scene_id: sc.id as string, number: n, heading: String(sc.heading ?? "") };
    if (!shots.length) {
      out.push({ ...base, stage: "needs_plan", label: "Needs an approved shot plan", pct: 0, counts: { shots: 0, prompts: 0, making: 0, made: 0, approved: 0, failed: 0 } });
      continue;
    }
    const k = { shots: shots.length, prompts: 0, making: 0, made: 0, approved: 0, failed: 0 };
    for (const x of shots) {
      if (x.pkgCurrent) k.prompts++;
      if (x.takes.some((t) => t.approval === "approved")) k.approved++;
      if (x.takes.some((t) => t.status === "queued" || t.status === "running")) k.making++;
      if (x.takes.some((t) => t.status === "succeeded")) k.made++;
      else if (x.takes.length && x.takes.every((t) => t.status === "failed" || t.status === "cancelled")) k.failed++;
    }
    const pct = Math.round((100 * k.approved) / k.shots);
    const [stage, label]: [VisualSceneProgress["stage"], string] =
      k.approved === k.shots ? ["approved", "Every shot has an approved take"]
      : k.making ? ["making", `Making ${k.making} take${k.making === 1 ? "" : "s"}`]
      : k.prompts < k.shots ? ["compiling", `${k.shots - k.prompts} prompt${k.shots - k.prompts === 1 ? "" : "s"} to compile`]
      : k.made > k.approved ? ["to_approve", `${k.made - k.approved} take${k.made - k.approved === 1 ? "" : "s"} to approve`]
      : ["ready_to_make", `${k.shots - k.made} shot${k.shots - k.made === 1 ? "" : "s"} ready for a take`];
    out.push({ ...base, stage, label, pct, counts: k });
  }
  const sum = (f: (x: VisualSceneProgress) => number) => out.reduce((n, x) => n + f(x), 0);
  const takes = st.shots.flatMap((x) => x.takes);
  return {
    scenes: out,
    totals: { scenes: out.length, planned: out.filter((x) => x.stage !== "needs_plan").length, shots: sum((x) => x.counts.shots), prompts: sum((x) => x.counts.prompts),
      making: sum((x) => x.counts.making), made: sum((x) => x.counts.made), approved: sum((x) => x.counts.approved), failed: sum((x) => x.counts.failed) },
    generator: { queued: takes.filter((t) => t.status === "queued").length, running: takes.filter((t) => t.status === "running").length, run_queue: takes.filter((t) => t.batch && (t.status === "queued" || t.status === "running")).length },
    at: new Date().toISOString(),
  };
}
