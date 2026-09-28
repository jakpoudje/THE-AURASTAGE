import { ProjectFactsSchema, type ProjectFacts } from "./input.schema";
import type { DiagnosticResult, Finding } from "./output.schema";
import { ENGINE_VERSION } from "./version";

const JOB_MODULE: Record<string, string> = { "generation.take": "generation", "rendering.render": "delivery" };
const REVIEW_LABEL: Record<string, [string, string]> = {
  scenes: ["script", "scene(s) changed in the latest script approval"],
  scene_dna: ["scene_dna", "locked Scene DNA marked for review"],
  shot_plans: ["shots", "shot plan(s) marked for review"],
  generation_packages: ["generation", "shot prompt(s) out of date"],
  audio_sessions: ["audio", "scene mix(es) marked for review"],
  timelines: ["editorial", "timeline marked for review"],
  renders: ["delivery", "deliverable(s) from an older Picture Lock"],
};

export function supportDiagnosticEngine(input: ProjectFacts): DiagnosticResult {
  const f = ProjectFactsSchema.parse(input);
  const out: Finding[] = [];
  const byEngine = new Map<string, { n: number; codes: Set<string>; last: string }>();
  for (const j of f.failed_jobs) {
    const e = byEngine.get(j.engine_id) ?? { n: 0, codes: new Set(), last: j.at };
    e.n += 1;
    if (j.code) e.codes.add(j.code);
    if (j.at > e.last) e.last = j.at;
    byEngine.set(j.engine_id, e);
  }
  for (const [engine, e] of byEngine) {
    out.push({ severity: "problem", module: JOB_MODULE[engine] ?? "general",
      message: `${e.n} ${engine.startsWith("rendering") ? "render" : engine.startsWith("generation") ? "generation" : "job"}${e.n === 1 ? "" : "s"} failed in the last 7 days`,
      evidence: `${engine}${e.codes.size ? ` · ${[...e.codes].join(", ")}` : ""} · last ${e.last}` });
  }
  for (const s of f.stuck_jobs) {
    out.push({ severity: "warning", module: JOB_MODULE[s.engine_id] ?? "general", message: `A ${s.engine_id.split(".")[0]} job has been waiting ${Math.round(s.minutes)} min`,
      evidence: `${s.engine_id} queued ${Math.round(s.minutes)} min ago — check System Status for the worker` });
  }
  for (const [table, n] of Object.entries(f.review_required)) {
    if (!n || !REVIEW_LABEL[table]) continue;
    const [module, what] = REVIEW_LABEL[table];
    out.push({ severity: "warning", module, message: `${n} ${what}`, evidence: `${table}: ${n} not current` });
  }
  if (f.script_approved === false) out.push({ severity: "info", module: "script", message: "The script isn't approved yet — later stages start from the approved script", evidence: "scripts.approved_version_id is empty" });
  if (f.picture_locked === false) out.push({ severity: "info", module: "editorial", message: "The picture isn't locked yet — deliverables need a Picture Lock", evidence: "timeline status is not locked" });
  const rank = { problem: 0, warning: 1, info: 2 } as const;
  return { findings: out.sort((a, b) => rank[a.severity] - rank[b.severity]), engine_version: ENGINE_VERSION };
}
