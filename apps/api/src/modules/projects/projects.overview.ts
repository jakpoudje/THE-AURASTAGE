// apps/api/src/modules/projects/projects.overview.ts
// Read-only production overview for the Dashboard. It asks each domain for its own read model (the same data its
// workspace shows, with review states refreshed by that domain) and hands the counts to productionOverviewEngine.
// It writes nothing itself and never estimates: every number comes from a domain's records (rule 12).
import type { SupabaseClient } from "@supabase/supabase-js";
import { productionOverviewEngine } from "@aurastage/engines";
import { getWorkspace as getScript } from "../screenplay/screenplay.service";
import { getCastingWorkspace } from "../characters/characters.service";
import { getDialogueWorkspace } from "../dialogue/dialogue.service";
import { getSceneDnaWorkspace } from "../scene-dna/sceneDna.service";
import { getStoryboard } from "../shots/shots.service";
import { getVisualWorkspace } from "../generation/generation.service";
import { getAudioWorkspace } from "../audio/audio.service";
import { getEditorialWorkspace } from "../editorial/editorial.service";
import { getDeliveryWorkspace } from "../rendering/rendering.service";
import { ForbiddenError } from "./projects.permissions";
import { enableRequestMemo } from "../../infrastructure/requestMemo";

type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getProjectOverview(db: SupabaseClient, projectId: string) {
  if (!UUID.test(projectId)) throw new ForbiddenError("Project not found");
  const { data: project, error } = await db.from("projects").select("id, title, type, genre, logline, target_runtime_minutes").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!project) throw new ForbiddenError("Project not found");

  // In pipeline order: each read refreshes its own review state from the one before it. Each stage's review refresh
  // runs once for this request (enableRequestMemo), and stages that don't depend on each other are read side by side
  // (2026-10-02: the overview took ~5 s; it is shown on every page).
  enableRequestMemo(db);
  const [script, casting] = (await Promise.all([getScript(db, projectId), getCastingWorkspace(db, projectId)])) as Row[];
  const dialogue = (await getDialogueWorkspace(db, projectId)) as Row;
  const dna = (await getSceneDnaWorkspace(db, projectId)) as Row;
  const board = (await getStoryboard(db, projectId)) as Row;
  const [visual, audio] = (await Promise.all([getVisualWorkspace(db, projectId, process.env, { sign: false }), getAudioWorkspace(db, projectId)])) as Row[];
  const edit = (await getEditorialWorkspace(db, projectId)) as Row;
  const [delivery, { count: assetCount }] = await Promise.all([
    getDeliveryWorkspace(db, projectId) as Promise<Row>,
    db.from("assets").select("id", { count: "exact", head: true }).eq("project_id", projectId).is("archived_at", null),
  ]);

  const activeScenes = (script.scenes as Row[]).filter((s) => s.status === "active");
  const chars = (casting.characters as Row[]).filter((c) => !c.merged_into);
  const lines = (dialogue.lines as Row[]).filter((l) => l.status === "active");
  const byScene = new Map<string, Row[]>();
  for (const l of lines) byScene.set(l.scene_id, [...(byScene.get(l.scene_id) ?? []), l]);
  const visualShots = (visual.scenes as Row[]).flatMap((s) => s.shots as Row[]);
  const audioScenes = (audio.scenes as Row[]).filter((s) => s.plan);
  const lock = delivery.picture_lock as Row | null;
  const renders = (delivery.renders as Row[]).filter((r) => lock && r.picture_lock_id === lock.id);
  const good = renders.filter((r) => r.status === "succeeded" && r.qc_passed && r.review_state === "current");
  const required = (delivery.required_profiles as string[]) ?? [];

  const facts = {
    script: { has_draft: !!script.current_version, approved_version: script.script?.approved_version_id ? ((script.versions as Row[]).find((v) => v.id === script.script.approved_version_id)?.version_number ?? null) : null, scenes: activeScenes.length },
    casting: { characters: chars.length, approved: chars.filter((c) => c.status === "approved").length, pending_candidates: (casting.pending as Row[]).length, sync: casting.sync.state },
    dialogue: {
      scenes_with_lines: byScene.size, scenes_approved: [...byScene.values()].filter((ls) => ls.every((l) => l.approval === "approved")).length,
      lines: lines.length, review_required: dialogue.analysis.review_required, sync: dialogue.sync.state,
    },
    scene_dna: { scenes: dna.summary.scenes, locked: dna.summary.approved, needs_review: dna.summary.needs_review },
    storyboard: { locked_scenes: board.summary.dna_locked, planned: board.summary.planned, approved: board.summary.approved, shots: board.summary.shots, needs_review: board.summary.needs_review },
    visual: {
      shots: visualShots.length, with_approved_take: visualShots.filter((s) => s.approved_take_id).length,
      needs_review: visualShots.filter((s) => s.package && s.package.review_state !== "current").length, running: visual.queue.waiting + visual.queue.running,
    },
    audio: {
      scenes: audioScenes.length, approved: audio.summary.approved,
      needs_review: audioScenes.filter((s) => s.session && s.session.review_state !== "current").length,
    },
    editorial: {
      timeline: !!edit.timeline, locked: edit.timeline?.status === "locked", lock_number: edit.timeline?.lock?.lock_number ?? null,
      review_required: edit.timeline?.review_state === "review_required", offline: (edit.clips as Row[]).filter((c) => c.kind === "slug").length, issues: (edit.issues as Row[]).length,
    },
    delivery: {
      picture_lock: !!lock, required: required.length, required_done: required.filter((id) => good.some((r) => r.profile_id === id)).length,
      delivered: new Set(good.map((r) => r.profile_id)).size, failed: renders.filter((r) => r.status === "failed").length,
      out_of_date: (delivery.renders as Row[]).filter((r) => r.status === "succeeded" && r.review_state !== "current").length,
    },
  };
  const out = productionOverviewEngine({ project_id: projectId, facts: facts as never });
  return {
    project,
    counts: {
      scenes: activeScenes.length, shots: board.summary.shots, characters: chars.length,
      locations: new Set(activeScenes.map((s) => String(s.location ?? "").trim().toUpperCase()).filter(Boolean)).size,
      dialogue_lines: lines.length, assets: assetCount ?? 0,
    },
    ...out,
  };
}
