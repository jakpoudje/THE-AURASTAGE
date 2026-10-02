// apps/api/src/modules/generation/generation.batch.ts
// One click for the whole film (owner, 2026-10-02), in the page's order: compile every shot's prompt, sketch every shot
// with the built-in AuraStage Sketch (free — so the film can be tested end to end before any paid image or video
// provider has credit), and approve a finished take for every shot that has none. Each step goes through the same
// gated, per-shot functions as the buttons on each shot, so everything stays editable one by one, and nothing a person
// approved or rejected is changed (rule 11).
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertProjectAccess } from "./generation.permissions";
import { compileShot, getVisualWorkspace, requestTakes, setTakeApproval } from "./generation.service";

type Env = Record<string, string | undefined>;
type Ws = Awaited<ReturnType<typeof getVisualWorkspace>>;
const usableShots = (ws: Ws) => ws.scenes.filter((s) => s.plan.usable).flatMap((s) => s.shots.map((x) => ({ scene: s.scene.number, ...x })));

/** Compiles every shot of every usable plan whose prompt is missing or needs review. */
export async function compileAllShots(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  const ws = await getVisualWorkspace(db, projectId, env);
  let compiled = 0;
  for (const x of usableShots(ws)) {
    if (x.package && x.package.review_state === "current") continue;
    await compileShot(db, projectId, x.shot.id, { aspect_ratio: ws.defaults.aspect_ratio });
    compiled++;
  }
  return { compiled, already: usableShots(ws).length - compiled, waiting_scenes: ws.scenes.filter((s) => !s.plan.usable).map((s) => s.scene.number) };
}

/** One free AuraStage Sketch for every shot with a current prompt and no take made or being made. */
export async function sketchAllShots(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  const ws = await getVisualWorkspace(db, projectId, env);
  let requested = 0, needs_prompt = 0, already = 0;
  for (const x of usableShots(ws)) {
    if (!x.package || x.package.review_state !== "current") { needs_prompt++; continue; }
    if (x.takes.some((t) => t.status === "queued" || t.status === "running" || t.status === "succeeded")) { already++; continue; }
    await requestTakes(db, x.package.id, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 1 }, `sketchall_${x.package.id}_${x.takes.length}`, env);
    requested++;
  }
  return { requested, already, needs_prompt };
}

/** Approves the newest finished, not-rejected take of every shot that has no approved take. */
export async function approveAllShots(db: SupabaseClient, projectId: string, env: Env = process.env) {
  await assertProjectAccess(db, projectId);
  const ws = await getVisualWorkspace(db, projectId, env);
  let approved = 0, waiting = 0;
  for (const x of usableShots(ws)) {
    if (x.approved_take_id) continue;
    const t = x.takes.filter((k) => k.status === "succeeded" && k.approval !== "rejected").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!t) { waiting++; continue; }
    await setTakeApproval(db, t.id, "approve", env);
    approved++;
  }
  return { approved, waiting, total: usableShots(ws).length };
}
