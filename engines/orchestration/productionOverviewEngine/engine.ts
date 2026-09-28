// productionOverviewEngine (SRS §14.1 readiness is evidence-based): turns what each stage's own read model reports into a
// plain-language overview. It never invents progress: every count and check comes from the facts it's given.
import { ProductionOverviewInputSchema, type ProductionOverviewInput } from "./input.schema";
import type { OverviewStage, ProductionOverviewOutput } from "./output.schema";
import { ENGINE_VERSION } from "./version";

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
type Draft = Omit<OverviewStage, "number" | "href"> & { path: string };

function state(done: number, total: number, review: number, upstreamReady: boolean): OverviewStage["state"] {
  if (!upstreamReady && done === 0) return "waiting";
  if (review > 0) return "needs_review";
  if (total > 0 && done >= total) return "complete";
  return done > 0 ? "in_progress" : "not_started";
}

export function productionOverviewEngine(raw: ProductionOverviewInput): ProductionOverviewOutput {
  const { project_id, facts: f } = ProductionOverviewInputSchema.parse(raw);
  const s: Draft[] = [];

  const scriptOk = f.script.approved_version !== null;
  s.push({
    id: "scriptwriter", path: "scriptwriter", label: "Scriptwriter", unit: "approved script",
    state: scriptOk ? "complete" : f.script.has_draft ? "in_progress" : "not_started",
    done: scriptOk ? 1 : 0, total: 1,
    summary: scriptOk ? `Version ${f.script.approved_version} approved · ${plural(f.script.scenes, "scene")}` : f.script.has_draft ? "A draft is saved but not approved yet" : "No script yet",
    checks: [
      { label: "A script draft is saved", ok: f.script.has_draft, evidence: f.script.has_draft ? "Saved" : "Nothing saved yet" },
      { label: "A version is approved (scenes come from it)", ok: scriptOk, evidence: scriptOk ? `Version ${f.script.approved_version}, ${plural(f.script.scenes, "scene")}` : "Not approved" },
    ],
    next_step: scriptOk ? null : f.script.has_draft ? "Approve the script" : "Write or import the script",
  });

  const c = f.casting;
  s.push({
    id: "casting", path: "casting", label: "Casting & Characters", unit: "characters approved",
    state: c.characters === 0 ? (scriptOk ? "not_started" : "waiting") : c.sync === "stale" ? "needs_review"
      : c.pending_candidates === 0 && c.approved === c.characters ? "complete" : "in_progress",
    done: c.characters ? c.approved : null, total: c.characters || null,
    summary: c.characters ? `${c.approved} of ${plural(c.characters, "character")} approved${c.pending_candidates ? ` · ${c.pending_candidates} to confirm` : ""}` : scriptOk ? "Find the characters in the approved script" : "Waiting for an approved script",
    checks: [
      { label: "Characters found in the approved script", ok: c.sync === "current", evidence: c.sync === "current" ? "Up to date with the approved script" : c.sync === "stale" ? "The script changed since characters were found" : c.sync === "never" ? "Not run yet" : "No approved script" },
      { label: "Every character is approved", ok: c.characters > 0 && c.approved === c.characters, evidence: `${c.approved} of ${c.characters}` },
      { label: "No candidates waiting for confirmation", ok: c.pending_candidates === 0, evidence: plural(c.pending_candidates, "candidate") },
    ],
    next_step: !scriptOk ? null : c.sync !== "current" ? "Find characters from the approved script" : c.pending_candidates ? "Confirm the new characters" : c.approved < c.characters ? "Approve the remaining characters" : null,
  });

  const d = f.dialogue;
  s.push({
    id: "dialogue", path: "dialogue", label: "Dialogue Intelligence", unit: "scenes approved",
    state: d.sync === "stale" ? "needs_review" : state(d.scenes_approved, d.scenes_with_lines, d.review_required, scriptOk),
    done: d.scenes_with_lines ? d.scenes_approved : null, total: d.scenes_with_lines || null,
    summary: d.lines ? `${d.scenes_approved} of ${plural(d.scenes_with_lines, "scene")} with dialogue approved · ${plural(d.lines, "line")}` : scriptOk ? "Bring in the lines from the approved script" : "Waiting for an approved script",
    checks: [
      { label: "Lines are in step with the approved script", ok: d.sync === "current", evidence: d.sync === "current" ? "Up to date" : d.sync === "stale" ? "The script changed since the lines were brought in" : "Not brought in yet" },
      { label: "No lines need review", ok: d.review_required === 0, evidence: plural(d.review_required, "line") },
    ],
    next_step: !scriptOk ? null : d.sync !== "current" ? "Bring in the dialogue" : d.review_required ? "Review the changed lines" : d.scenes_approved < d.scenes_with_lines ? "Approve each scene's dialogue" : null,
  });

  const n = f.scene_dna;
  s.push({
    id: "scene-dna", path: "scene-dna", label: "Scene DNA", unit: "scenes locked",
    state: state(n.locked, n.scenes, n.needs_review, scriptOk),
    done: n.scenes ? n.locked : null, total: n.scenes || null,
    summary: n.scenes ? `${n.locked} of ${plural(n.scenes, "scene")} locked${n.needs_review ? ` · ${n.needs_review} need review` : ""}` : "Waiting for an approved script",
    checks: [
      { label: "Every scene is locked", ok: n.scenes > 0 && n.locked === n.scenes, evidence: `${n.locked} of ${n.scenes}` },
      { label: "No locked scene needs review after an upstream change", ok: n.needs_review === 0, evidence: plural(n.needs_review, "scene") },
    ],
    next_step: n.needs_review ? "Review and re-lock the flagged scenes" : n.scenes && n.locked < n.scenes ? "Lock the remaining scenes" : null,
  });

  const b = f.storyboard;
  s.push({
    id: "storyboard", path: "storyboard", label: "Storyboard & Shots", unit: "shot plans approved",
    state: state(b.approved, b.locked_scenes, b.needs_review, b.locked_scenes > 0),
    done: b.locked_scenes ? b.approved : null, total: b.locked_scenes || null,
    summary: b.locked_scenes ? `${b.approved} of ${plural(b.locked_scenes, "locked scene")} have an approved shot plan · ${plural(b.shots, "shot")}` : "Waiting for a locked scene in Scene DNA",
    checks: [
      { label: "Every locked scene has an approved shot plan", ok: b.locked_scenes > 0 && b.approved === b.locked_scenes, evidence: `${b.approved} of ${b.locked_scenes}` },
      { label: "No shot plan needs review", ok: b.needs_review === 0, evidence: plural(b.needs_review, "plan") },
    ],
    next_step: b.needs_review ? "Review the flagged shot plans" : b.locked_scenes && b.approved < b.locked_scenes ? (b.planned < b.locked_scenes ? "Plan shots for the locked scenes" : "Approve the shot plans") : null,
  });

  const v = f.visual;
  s.push({
    id: "visual", path: "visual", label: "Visual Generation", unit: "shots with an approved take",
    state: state(v.with_approved_take, v.shots, v.needs_review, v.shots > 0),
    done: v.shots ? v.with_approved_take : null, total: v.shots || null,
    summary: v.shots ? `${v.with_approved_take} of ${plural(v.shots, "planned shot")} have an approved take${v.running ? ` · ${v.running} generating` : ""}` : "Waiting for an approved shot plan",
    checks: [
      { label: "Every planned shot has an approved take", ok: v.shots > 0 && v.with_approved_take === v.shots, evidence: `${v.with_approved_take} of ${v.shots}` },
      { label: "No compiled prompt needs review", ok: v.needs_review === 0, evidence: plural(v.needs_review, "prompt") },
    ],
    next_step: v.needs_review ? "Recompile the flagged prompts" : v.shots && v.with_approved_take < v.shots ? "Generate and approve takes" : null,
  });

  const a = f.audio;
  s.push({
    id: "audio", path: "audio", label: "Audio Studio", unit: "scene mixes approved",
    state: state(a.approved, a.scenes, a.needs_review, a.scenes > 0),
    done: a.scenes ? a.approved : null, total: a.scenes || null,
    summary: a.scenes ? `${a.approved} of ${plural(a.scenes, "scene")} have an approved, current mix` : "Waiting for an approved shot plan",
    checks: [
      { label: "Every planned scene has an approved mix", ok: a.scenes > 0 && a.approved === a.scenes, evidence: `${a.approved} of ${a.scenes}` },
      { label: "No mix needs review", ok: a.needs_review === 0, evidence: plural(a.needs_review, "mix", "mixes") },
    ],
    next_step: a.needs_review ? "Review the flagged mixes" : a.scenes && a.approved < a.scenes ? "Record, measure and approve the scene mixes" : null,
  });

  const e = f.editorial;
  const eReady = v.with_approved_take > 0 || a.approved > 0;
  s.push({
    id: "editorial", path: "editorial", label: "Editorial & Timeline", unit: "Picture Lock",
    state: !e.timeline ? (eReady ? "not_started" : "waiting") : e.review_required ? "needs_review" : e.locked ? "complete" : "in_progress",
    done: e.timeline ? (e.locked ? 1 : 0) : null, total: e.timeline ? 1 : null,
    summary: !e.timeline ? (eReady ? "Build the first assembly" : "Waiting for approved takes or mixes") : e.locked ? `Picture Lock ${e.lock_number}` : `Assembly in progress${e.offline ? ` · ${plural(e.offline, "offline shot")}` : ""}`,
    checks: [
      { label: "An assembly exists", ok: e.timeline, evidence: e.timeline ? "Timeline saved" : "No timeline yet" },
      { label: "No offline shots", ok: e.timeline && e.offline === 0, evidence: plural(e.offline, "offline shot") },
      { label: "Picture is locked", ok: e.locked, evidence: e.locked ? `Picture Lock ${e.lock_number}` : "Not locked" },
      { label: "Nothing upstream changed since", ok: !e.review_required, evidence: e.review_required ? plural(e.issues, "issue") : "Current" },
    ],
    next_step: !e.timeline ? (eReady ? "Build the first assembly" : null) : e.review_required ? "Review the timeline issues" : !e.locked ? "Finish the cut and lock the picture" : null,
  });

  const x = f.delivery;
  s.push({
    id: "export", path: "export", label: "Export & Deliver", unit: "required deliverables",
    state: !x.picture_lock ? "waiting" : x.out_of_date > 0 ? "needs_review" : x.required > 0 ? state(x.required_done, x.required, 0, true) : x.delivered > 0 ? "complete" : "not_started",
    done: x.required ? x.required_done : x.picture_lock ? x.delivered : null, total: x.required || null,
    summary: !x.picture_lock ? "Waiting for a Picture Lock" : x.required ? `${x.required_done} of ${plural(x.required, "required deliverable")} rendered with QC passed` : `${plural(x.delivered, "deliverable")} rendered with QC passed`,
    checks: [
      { label: "Rendered from the current Picture Lock", ok: x.picture_lock, evidence: x.picture_lock ? "Picture Lock present" : "No Picture Lock" },
      { label: "Required deliverables done (Project Settings)", ok: x.required > 0 ? x.required_done === x.required : x.delivered > 0, evidence: x.required ? `${x.required_done} of ${x.required}` : "None required yet" },
      { label: "No failed renders", ok: x.failed === 0, evidence: plural(x.failed, "failed render") },
      { label: "Nothing out of date", ok: x.out_of_date === 0, evidence: plural(x.out_of_date, "deliverable") },
    ],
    next_step: !x.picture_lock ? null : x.required && x.required_done < x.required ? "Render the required deliverables" : x.out_of_date ? "Re-render out-of-date deliverables" : null,
  });

  const stages = s.map(({ path, ...rest }, i) => ({ ...rest, number: i + 1, href: `/projects/${project_id}/${path}` }));
  const attention = stages.filter((t) => t.state === "needs_review").map((t) => ({ stage: t.id, label: `${t.label}: ${t.next_step ?? t.summary}`, href: t.href }));
  const nx = stages.find((t) => t.next_step && t.state !== "waiting");
  return {
    stages,
    complete: stages.filter((t) => t.state === "complete").length,
    attention,
    next: nx ? { stage: nx.id, label: `${nx.label}: ${nx.next_step}`, href: nx.href } : null,
    engine_version: ENGINE_VERSION,
  };
}
