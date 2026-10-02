"use client";

// "What's next" on every stage (owner request 2026-09-30: "save and continue to the next logical step; the platform can
// intelligently guide users"). The guidance is the Dashboard's own production overview — each stage's state and next
// step worked out from its records (productionOverviewEngine), never a made-up percentage. It re-reads after anything is
// saved or applied, and once this stage is done it offers "Continue" to the next one.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, SAVED_EVENT } from "@/lib/apiClient";
import { APPLIED_EVENT } from "@/modules/ask-aurastage/askBus";
import { STAGE_WORKFLOW } from "./stageWorkflow";

type Check = { label: string; ok: boolean; evidence: string };
type Stage = { id: string; label: string; href: string; state: string; done: number | null; total: number | null; unit: string; summary: string; next_step: string | null; checks?: Check[] };

export function NextStepBar({ projectId, active, order }: { projectId: string; active: string; order: { key: string; label: string; path: string }[] }) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  // The workflow (this stage's steps and how to work all-at-once or one-at-a-time) can be folded away; remembered here.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("aura.workflow.open") === "0") setOpen(false); } catch { /* storage unavailable */ }
  }, []);
  const toggle = () => setOpen((o) => { try { localStorage.setItem("aura.workflow.open", o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(() => apiGet<{ stages: Stage[] }>(`/api/projects/${projectId}/overview`).then((o) => setStages(o.stages)).catch(() => null), [projectId]);
  useEffect(() => {
    load();
    const again = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 1200);
    };
    window.addEventListener(SAVED_EVENT, again);
    window.addEventListener(APPLIED_EVENT, again);
    return () => {
      window.removeEventListener(SAVED_EVENT, again);
      window.removeEventListener(APPLIED_EVENT, again);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const i = order.findIndex((s) => s.key === active);
  if (i < 0) return null;
  const nextNav = order[i + 1] ?? null;
  const here = stages?.find((s) => s.id === active) ?? null;
  const next = nextNav ? stages?.find((s) => s.id === nextNav.key) ?? null : null;
  const done = here?.state === "complete";
  const progress = here && here.total !== null && here.done !== null ? `${here.done}/${here.total} ${here.unit}` : null;
  const how = STAGE_WORKFLOW[active];
  const checks = here?.checks ?? [];
  const firstOpen = checks.findIndex((c) => !c.ok);

  return (
    <div className={`border-b ${done ? "border-emerald-500/30 bg-emerald-500/5" : "border-aura-border bg-black/20"}`}>
    <div role="region" aria-label="What's next" data-testid="next-step" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 text-xs">
      <span className="font-medium uppercase tracking-wider text-white/40">What&apos;s next</span>
      {!stages ? (
        <span className="text-white/40">Checking this project…</span>
      ) : done ? (
        <span className="text-emerald-300">✓ This stage is done{progress ? ` (${progress})` : ""}.</span>
      ) : here ? (
        <span className="text-white/80">
          {here.next_step ?? here.summary}
          {progress && <span className="text-white/40"> · {progress}</span>}
        </span>
      ) : (
        <span className="text-white/60">Work through this page, then continue.</span>
      )}
      {nextNav && (
        <Link
          href={`/projects/${projectId}/${nextNav.path}`}
          className={done ? "ml-auto rounded-md bg-aura-gold px-3 py-1 font-medium text-black" : "ml-auto text-white/50 underline hover:text-aura-gold"}
          title={next?.next_step ?? undefined}
        >
          {done ? `Continue to ${nextNav.label} →` : `Skip ahead to ${nextNav.label} →`}
        </Link>
      )}
      {done && next?.next_step && <span className="w-full text-right text-white/40">There: {next.next_step}</span>}
      {how && (
        <button onClick={toggle} aria-expanded={open} aria-controls="stage-workflow" className="text-white/40 underline hover:text-aura-gold">
          {open ? "Hide workflow" : "Show workflow"}
        </button>
      )}
    </div>
    {how && open && (
      <div id="stage-workflow" role="region" aria-label="Workflow on this page" className="space-y-1.5 px-6 pb-2 text-[11px]">
        {checks.length > 0 && (
          <ol className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Steps on this page">
            {checks.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1.5" data-ok={c.ok} title={c.evidence}>
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${c.ok ? "bg-emerald-400 text-black" : i === firstOpen ? "bg-aura-gold text-black" : "border border-white/25 text-white/50"}`}>{c.ok ? "✓" : i + 1}</span>
                <span className={c.ok ? "text-white/60" : i === firstOpen ? "text-aura-gold" : "text-white/70"}>{c.label}</span>
                <span className="text-white/35">· {c.evidence}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-white/70"><span className="font-medium text-white/50">All at once: </span>{how.all}</p>
        <p className="text-white/70"><span className="font-medium text-white/50">One at a time: </span>{how.one}</p>
      </div>
    )}
    </div>
  );
}
