"use client";

// Where the selected production stands, stage by stage. Every number is a real count from that stage's own
// records (GET /api/projects/:id/overview, productionOverviewEngine) — never an estimated percentage.
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { ActivityFeed } from "@/modules/team-collaboration/components/ActivityFeed";

type Check = { label: string; ok: boolean; evidence: string };
type Stage = { id: string; number: number; label: string; href: string; state: "not_started" | "waiting" | "in_progress" | "needs_review" | "complete"; done: number | null; total: number | null; unit: string; summary: string; checks: Check[]; next_step: string | null };
export type Overview = {
  project: { id: string; title: string; type: string; genre: string | null; logline: string | null; target_runtime_minutes: number | null };
  counts: { scenes: number; shots: number; characters: number; locations: number; dialogue_lines: number; assets: number };
  stages: Stage[]; complete: number; attention: { stage: string; label: string; href: string }[]; next: { stage: string; label: string; href: string } | null;
};

const STATE: Record<Stage["state"], { label: string; cls: string }> = {
  complete: { label: "Complete", cls: "border-emerald-500/50 text-emerald-300" },
  in_progress: { label: "In progress", cls: "border-aura-gold/50 text-aura-gold" },
  needs_review: { label: "Needs review", cls: "border-orange-500/60 text-orange-300" },
  not_started: { label: "Not started", cls: "border-aura-border text-white/60" },
  waiting: { label: "Waiting", cls: "border-aura-border text-white/40" },
};

export function ProductionOverview({ projectId }: { projectId: string }) {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setO(null);
    setError(null);
    apiGet<Overview>(`/api/projects/${projectId}/overview`).then(setO).catch((e) => setError(e.message));
  }, [projectId]);
  if (error) return <p role="alert" className="rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-300">{error}</p>;
  if (!o) return <p className="text-sm text-white/50">Checking every stage of the production…</p>;
  return (
    <section aria-label="Production overview" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl">{o.project.title}</h2>
          <p className="text-xs text-white/50" data-testid="stages-complete">{o.complete} of {o.stages.length} stages complete</p>
        </div>
        {o.next && <Link href={o.next.href} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">Next: {o.next.label} →</Link>}
      </div>
      {o.attention.length > 0 && (
        <ul aria-label="Needs attention" className="space-y-1 rounded-md border border-orange-500/40 bg-orange-500/5 p-3 text-sm">
          {o.attention.map((a) => <li key={a.stage}><Link href={a.href} className="text-orange-200 underline decoration-orange-400/40">{a.label}</Link></li>)}
        </ul>
      )}
      <ol aria-label="Stages" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {o.stages.map((s) => {
          const st = STATE[s.state];
          return (
            <li key={s.id} data-testid={`stage-${s.id}`} className="rounded-lg border border-aura-border bg-aura-panel p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={s.href} className="flex items-center gap-2 hover:text-aura-gold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-aura-gold/60 text-xs text-aura-gold">{s.number}</span>
                  <span className="font-display">{s.label}</span>
                </Link>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${st.cls}`}>{st.label}</span>
              </div>
              <p className="mt-2 text-sm text-white/70">{s.summary}</p>
              {s.total !== null && s.done !== null && (
                <div className="mt-2" aria-label={`${s.done} of ${s.total} ${s.unit}`}>
                  <div className="h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-aura-gold" style={{ width: `${Math.min(100, (s.done / Math.max(1, s.total)) * 100)}%` }} /></div>
                  <p className="mt-1 text-[11px] text-white/40">{s.done} of {s.total} {s.unit}</p>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-xs">
                <button onClick={() => setOpen(open === s.id ? null : s.id)} className="text-white/50 underline">{open === s.id ? "Hide checks" : "Why?"}</button>
                {s.next_step && <Link href={s.href} className="text-aura-gold">{s.next_step} →</Link>}
              </div>
              {open === s.id && (
                <ul className="mt-2 space-y-1 text-xs" aria-label={`${s.label} checks`}>
                  {s.checks.map((c) => <li key={c.label}><span className={c.ok ? "text-emerald-300" : "text-white/40"}>{c.ok ? "✓" : "○"}</span> {c.label} <span className="text-white/40">— {c.evidence}</span></li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
          <h3 className="font-display text-lg">Project overview</h3>
          {o.project.logline && <p className="mt-1 text-sm text-white/70">{o.project.logline}</p>}
          <p className="mt-1 text-xs text-white/50">{o.project.type.replace("_", " ")}{o.project.genre ? ` · ${o.project.genre}` : ""}{o.project.target_runtime_minutes ? ` · ${o.project.target_runtime_minutes} min` : ""}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center" aria-label="Counts">
            {([["Scenes", o.counts.scenes], ["Shots", o.counts.shots], ["Characters", o.counts.characters], ["Locations", o.counts.locations], ["Lines", o.counts.dialogue_lines], ["Assets", o.counts.assets]] as const).map(([k, v]) => (
              <div key={k} className="rounded-md border border-aura-border p-2"><dt className="text-[10px] uppercase tracking-wide text-white/40">{k}</dt><dd className="font-display text-xl">{v}</dd></div>
            ))}
          </dl>
        </div>
        <ActivityFeed projectId={o.project.id} />
      </div>
    </section>
  );
}
