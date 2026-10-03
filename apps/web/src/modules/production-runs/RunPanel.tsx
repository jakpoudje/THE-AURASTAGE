"use client";

// What is happening in the background, for everyone on the project (owner request 2026-10-02): the area's production
// run — who started it, which step it is on, what it just did, its log — and every scene's stage and % from the records.
// Bars are segmented by real counts (placed / made / being made / waiting …); nothing here is an estimate.

import { useMemo, useState } from "react";
import type { ProductionRun } from "@aurastage/contracts";
import type { Area, AreaProgress, SceneProgress } from "./runsApi";

const PHASE_LABEL: Record<string, string> = {
  spot: "Spot scenes", generate: "Generate sounds", finish: "Place & finish", place: "Place sounds",
  compile: "Compile prompts", make: "Sketch & approve", sketch: "Sketch shots", approve: "Approve takes",
  plan: "Plan scenes, one after another",
};
const phaseLabel = (area: Area, p: string) => (area === "storyboard" && p === "approve" ? "Approve every ready plan" : PHASE_LABEL[p] ?? p);
export const RUN_TITLE: Record<string, string> = {
  "audio.film": "Whole film sound — spot, generate and place, scene by scene",
  "audio.spot": "Spotting every scene", "audio.generate": "Generating every planned sound", "audio.place": "Placing every generated sound",
  "visual.film": "Whole film pictures — compile, sketch and approve, scene by scene",
  "visual.compile": "Compiling every shot's prompt", "visual.sketch": "Sketching every shot (free)", "visual.approve": "Approving a take for every shot",
  "storyboard.film": "Whole film shot plans — plan every scene in order, then approve",
  "storyboard.replan": "Whole film shot plans — plan and re-plan flagged scenes in order, then approve",
};

type Seg = { n: number; cls: string; label: string; moving?: boolean };
function segments(area: Area, c: Record<string, number>): { total: number; segs: Seg[] } {
  if (area === "storyboard") {
    return { total: 1, segs: [
      { n: c.approved ?? 0, cls: "bg-emerald-400", label: "plan approved" },
      { n: c.planned ?? 0, cls: "bg-teal-300/70", label: "planned, to approve" },
      { n: c.review ?? 0, cls: "bg-amber-400/80", label: "needs re-planning" },
    ] };
  }
  if (area === "audio") {
    return { total: c.total ?? 0, segs: [
      { n: c.placed ?? 0, cls: "bg-emerald-400", label: "placed" },
      { n: c.made ?? 0, cls: "bg-teal-300/70", label: "made, to place" },
      { n: c.making ?? 0, cls: "bg-sky-400", label: "being made", moving: true },
      { n: c.failed ?? 0, cls: "bg-red-400/80", label: "failed" },
    ] };
  }
  const shots = c.shots ?? 0, a = c.approved ?? 0, b = Math.max(0, (c.made ?? 0) - a), m = Math.max(0, Math.min(c.making ?? 0, shots - a - b));
  const p = Math.max(0, Math.min((c.prompts ?? 0) - a - b - m, shots - a - b - m));
  return { total: shots, segs: [
    { n: a, cls: "bg-emerald-400", label: "approved" },
    { n: b, cls: "bg-teal-300/70", label: "take made, to approve" },
    { n: m, cls: "bg-sky-400", label: "being made", moving: true },
    { n: p, cls: "bg-aura-gold/50", label: "prompt ready" },
  ] };
}

/** The run's own measure of done, from the records (rule 12). */
export function overallPct(area: Area, kind: string | null, t: Record<string, number> | undefined) {
  if (!t) return null;
  const r = (a: number, b: number) => (b > 0 ? Math.round((100 * Math.min(a, b)) / b) : null);
  if (area === "storyboard") return r(t.approved ?? 0, t.scenes ?? 0);
  if (area === "audio") {
    if (kind === "audio.spot") return r(t.spotted ?? 0, t.scenes ?? 0);
    if (kind === "audio.generate") return r((t.clips ?? 0) - (t.waiting ?? 0) - (t.failed ?? 0), t.clips ?? 0);
    return r(t.placed ?? 0, t.clips ?? 0);
  }
  if (kind === "visual.compile") return r(t.prompts ?? 0, t.shots ?? 0);
  if (kind === "visual.sketch") return r((t.made ?? 0) + (t.making ?? 0), t.shots ?? 0);
  return r(t.approved ?? 0, t.shots ?? 0);
}

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

function SceneRow({ area, s }: { area: Area; s: SceneProgress }) {
  const { total, segs } = segments(area, s.counts);
  const active = s.stage === "making";
  return (
    <li className="grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-2 py-1 text-xs" aria-label={`Scene ${s.number}: ${s.label}, ${s.pct}%`}>
      <span className="truncate text-white/70" title={s.heading}>
        <span className={active ? "text-sky-300" : "text-white/50"}>{s.number}.</span> {s.heading}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="flex h-2 overflow-hidden rounded-full bg-white/10" role="presentation">
          {total > 0 && segs.map((g) => g.n > 0 && (
            <span key={g.label} title={`${g.n} ${g.label}`} className={`${g.cls} ${g.moving ? "aura-run-stripes" : ""}`} style={{ width: `${(100 * g.n) / total}%` }} />
          ))}
        </span>
        <span className={`truncate ${s.stage === "approved" || s.stage === "ready_to_mix" ? "text-emerald-300/80" : active ? "text-sky-300" : s.stage === "needs_plan" ? "text-white/30" : "text-white/50"}`}>{s.label}</span>
      </span>
      <span className="text-right tabular-nums text-white/60">{s.stage === "needs_plan" || s.stage === "ready_to_spot" ? "—" : `${s.pct}%`}</span>
    </li>
  );
}

export function RunPanel(props: {
  area: Area; run: ProductionRun | null; progress: AreaProgress | null; error: string | null;
  onControl: (a: "pause" | "resume" | "stop") => void; canRun: boolean;
}) {
  const { area, run, progress, error } = props;
  const [onlyMoving, setOnlyMoving] = useState(false);
  const running = run?.status === "running";
  const pct = overallPct(area, run?.kind ?? null, progress?.totals);
  const phases = (run?.progress?.phases as string[] | undefined) ?? [];
  const phaseIdx = phases.indexOf(run?.phase ?? "");
  const gen = progress?.generator;
  const scenes = useMemo(() => {
    const all = progress?.scenes ?? [];
    return onlyMoving ? all.filter((s) => !["approved", "needs_plan", "ready_to_mix", "nothing_planned"].includes(s.stage)) : all;
  }, [progress, onlyMoving]);
  const generatorBusy = !!gen && gen.queued + gen.running > 0;
  if (!run && !generatorBusy && !error) return null;

  return (
    <section aria-label="Background activity" className="rounded-xl border border-sky-500/30 bg-aura-panel p-3">
      <style>{`@keyframes aura-run-move{from{background-position:0 0}to{background-position:24px 0}}
        .aura-run-stripes{background-image:linear-gradient(45deg,rgba(255,255,255,.35) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.35) 50%,rgba(255,255,255,.35) 75%,transparent 75%);background-size:24px 24px;animation:aura-run-move 1s linear infinite}
        @media (prefers-reduced-motion: reduce){.aura-run-stripes{animation:none}}`}</style>
      <div className="flex flex-wrap items-center gap-2">
        {running && <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-hidden />}
        <h3 className="text-sm font-medium text-white">{run ? RUN_TITLE[run.kind] ?? run.kind : "The generator is working in the background"}</h3>
        {run && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${run.status === "running" ? (run.idle ? "bg-amber-500/20 text-amber-200" : "bg-sky-500/20 text-sky-200") : run.status === "completed" ? "bg-emerald-500/20 text-emerald-200" : run.status === "paused" ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-white/60"}`}>
            {run.status === "running" ? (run.idle ? "waiting for an open page" : "running") : run.status}
          </span>
        )}
        {run && <span className="text-[11px] text-white/40">started by {run.started_by_label ?? "a team member"} {ago(run.started_at)} · updated {ago(run.updated_at)}</span>}
        <span className="flex-1" />
        {run && props.canRun && (run.status === "running" || run.status === "paused") && (
          <>
            {run.status === "running" ? (
              <button onClick={() => props.onControl("pause")} className="rounded border border-aura-border px-2 py-1 text-xs">⏸ Pause</button>
            ) : (
              <button onClick={() => props.onControl("resume")} className="rounded border border-aura-gold px-2 py-1 text-xs text-aura-gold">▶ Resume</button>
            )}
            <button onClick={() => props.onControl("stop")} className="rounded border border-aura-border px-2 py-1 text-xs text-white/60">■ Stop</button>
          </>
        )}
      </div>

      {phases.length > 1 && (
        <ol className="mt-2 flex flex-wrap gap-1 text-[11px]" aria-label="Steps">
          {phases.map((p, i) => (
            <li key={p} className={`rounded-full border px-2 py-0.5 ${i < phaseIdx || run?.status === "completed" ? "border-emerald-500/40 text-emerald-300" : i === phaseIdx ? "border-sky-400 text-sky-200" : "border-aura-border text-white/40"}`}
              aria-current={i === phaseIdx ? "step" : undefined}>
              {i < phaseIdx || run?.status === "completed" ? "✓ " : i === phaseIdx && running ? "● " : ""}{i + 1} · {phaseLabel(area, p)}
            </li>
          ))}
        </ol>
      )}

      {pct !== null && (
        <div className="mt-2 flex items-center gap-2" aria-label={`Overall ${pct}%`}>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span className={`block h-full bg-emerald-400 transition-all duration-700 ${running ? "aura-run-stripes" : ""}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="w-10 text-right text-sm tabular-nums text-white">{pct}%</span>
        </div>
      )}
      {run?.message && <p className="mt-2 text-xs text-white/70" aria-live="polite">{run.message}</p>}
      {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
      {gen && area === "storyboard" && progress && (
        <p className="mt-1 text-[11px] text-white/45">
          {progress.totals.approved ?? 0} of {progress.totals.scenes ?? 0} scenes have an approved shot plan · {progress.totals.shots ?? 0} shots
          {progress.totals.review ? ` · ${progress.totals.review} flagged for re-planning` : ""}
          {(progress.totals.scenes ?? 0) > (progress.totals.dna_locked ?? 0) ? ` · ${(progress.totals.scenes ?? 0) - (progress.totals.dna_locked ?? 0)} waiting for Scene DNA` : ""}
        </p>
      )}
      {gen && area !== "storyboard" && (
        <p className="mt-1 text-[11px] text-white/45">
          Generator: {gen.running} being made now · {gen.queued} waiting{gen.run_queue ? ` (${gen.run_queue} from runs — your own requests always go first)` : ""}
          {progress && ` · ${area === "audio" ? `${progress.totals.placed ?? 0} of ${progress.totals.clips ?? 0} sounds placed, ${progress.totals.approved ?? 0} of ${progress.totals.scenes ?? 0} mixes approved` : `${progress.totals.approved ?? 0} of ${progress.totals.shots ?? 0} shots approved, ${progress.totals.prompts ?? 0} prompts current`}`}
        </p>
      )}

      {progress && progress.scenes.length > 0 && (
        <details className="mt-2" open={running}>
          <summary className="cursor-pointer text-xs text-white/60">Every scene ({progress.scenes.length}) — stage and % from the records</summary>
          <label className="mt-1 flex items-center gap-1 text-[11px] text-white/50">
            <input type="checkbox" checked={onlyMoving} onChange={(e) => setOnlyMoving(e.target.checked)} /> Only scenes still in progress
          </label>
          <ul className="mt-1 max-h-72 overflow-y-auto pr-1" aria-label="Scene progress">
            {scenes.map((s) => <SceneRow key={s.scene_id} area={area} s={s} />)}
          </ul>
          <p className="mt-1 flex flex-wrap gap-3 text-[10px] text-white/40">
            {segments(area, {}).segs.map((g) => <span key={g.label} className="flex items-center gap-1"><span className={`inline-block h-2 w-3 rounded-sm ${g.cls}`} />{g.label}</span>)}
          </p>
        </details>
      )}
      {run && run.log.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-white/50">What it has done ({run.log.length})</summary>
          <ol className="mt-1 max-h-40 overflow-y-auto text-[11px] text-white/50" aria-label="Run log">
            {[...run.log].reverse().map((l, i) => <li key={i}><span className="text-white/30">{new Date(l.at).toLocaleTimeString()}</span> — {l.text}</li>)}
          </ol>
        </details>
      )}
    </section>
  );
}
