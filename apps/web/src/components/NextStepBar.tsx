"use client";

// "What's next" on every stage (owner request 2026-09-30: "save and continue to the next logical step; the platform can
// intelligently guide users"). The guidance is the Dashboard's own production overview — each stage's state and next
// step worked out from its records (productionOverviewEngine), never a made-up percentage. It re-reads after anything is
// saved or applied, and once this stage is done it offers "Continue" to the next one.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, SAVED_EVENT } from "@/lib/apiClient";
import { APPLIED_EVENT } from "@/modules/ask-aurastage/askBus";

type Stage = { id: string; label: string; href: string; state: string; done: number | null; total: number | null; unit: string; summary: string; next_step: string | null };

export function NextStepBar({ projectId, active, order }: { projectId: string; active: string; order: { key: string; label: string; path: string }[] }) {
  const [stages, setStages] = useState<Stage[] | null>(null);
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

  return (
    <div role="region" aria-label="What's next" data-testid="next-step" className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-6 py-2 text-xs ${done ? "border-emerald-500/30 bg-emerald-500/5" : "border-aura-border bg-black/20"}`}>
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
    </div>
  );
}
