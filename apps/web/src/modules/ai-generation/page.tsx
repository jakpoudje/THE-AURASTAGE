"use client";

// apps/web/src/modules/ai-generation/page.tsx
// AI & Generation — is every kind of generation ready, with proof? Backend: apps/api/src/modules/projects/projects.generation.ts
// (generationReadinessEngine). States come only from configured backends and what was actually made in this project.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Project } from "@aurastage/contracts";
import { AppShell } from "@/components/AppShell";
import { apiGet } from "@/lib/apiClient";
import { getSupabaseClient } from "@/lib/supabaseClient";

type State = "proven" | "ready" | "needs_key" | "not_built";
interface Cap {
  id: string; label: string; where: string; href: string | null; state: State; headline: string; now: string[];
  upgrades: { name: string; key: string | null; built: boolean }[];
  evidence: { succeeded: number; failed: number; last_success_at: string | null };
}
interface Readiness { capabilities: Cap[]; summary: Record<State | "total", number>; engine_version: string }

const BADGE: Record<State, { label: string; cls: string }> = {
  proven: { label: "Working — proven", cls: "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" },
  ready: { label: "Ready — not tried yet", cls: "border-sky-400/60 bg-sky-400/10 text-sky-300" },
  needs_key: { label: "Needs a key", cls: "border-amber-400/60 bg-amber-400/10 text-amber-300" },
  not_built: { label: "Not built yet", cls: "border-white/20 text-white/50" },
};

export default function GenerationReadinessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [r, setR] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return router.replace("/sign-in");
      try {
        const [p, g] = await Promise.all([apiGet<Project>(`/api/projects/${id}`), apiGet<Readiness>(`/api/projects/${id}/generation-readiness`)]);
        setProject(p);
        setR(g);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load");
      }
    })();
  }, [id, router]);

  if (error) return <div className="p-12 text-center text-red-400">{error}</div>;
  if (!project || !r) return <div className="p-12 text-center text-white/50">Checking every generator…</div>;
  return (
    <AppShell project={project} active="generation">
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">AI & Generation</p>
        <h1 className="mt-2 font-display text-4xl">Is Everything <span className="text-aura-gold">Ready?</span></h1>
        <p className="mt-2 max-w-3xl text-white/60">
          Every kind of generation, what works today and the proof, and exactly which key switches on the paid version. Nothing here is estimated —
          “working” means something was actually made in this project.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Summary" data-testid="readiness-summary">
          {(["proven", "ready", "needs_key", "not_built"] as State[]).map((s) => (
            <span key={s} className={`rounded-full border px-3 py-1 ${BADGE[s].cls}`}>{r.summary[s]} {BADGE[s].label.toLowerCase()}</span>
          ))}
        </div>
      </section>
      <div className="grid gap-4 p-8 md:grid-cols-2" role="list" aria-label="Generators">
        {r.capabilities.map((c) => (
          <article key={c.id} role="listitem" aria-label={c.label} data-testid={`cap-${c.id}`} className="rounded-xl border border-aura-border bg-aura-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg">{c.label}</h2>
                <p className="text-xs text-white/45">{c.where}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${BADGE[c.state].cls}`}>{BADGE[c.state].label}</span>
            </div>
            <p className="mt-3 text-sm">{c.headline}</p>
            {c.now.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-white/60">{c.now.map((n) => <li key={n}>✓ {n}</li>)}</ul>
            )}
            {c.upgrades.length > 0 && (
              <div className="mt-3 rounded-md border border-aura-border bg-black/20 p-2 text-xs">
                <div className="mb-1 text-white/45">Paid options</div>
                <ul className="space-y-0.5">
                  {c.upgrades.map((u) => (
                    <li key={u.name}>{u.name}: {u.built ? <>add <code className="text-aura-gold">{u.key}</code> in Railway to switch on</> : <span className="text-white/45">connection not built yet</span>}</li>
                  ))}
                </ul>
              </div>
            )}
            {c.href && <Link href={c.href} className="mt-3 inline-block text-xs text-aura-gold underline">{c.id === "assistant" ? "Try it in Scriptwriter" : `Open ${c.where.split(" →")[0]}`} →</Link>}
          </article>
        ))}
      </div>
      <p className="px-8 pb-10 text-xs text-white/40">Keys are added in Railway → your project → the API service and the generation-worker service → Variables. Built-in generators are free and always available.</p>
    </AppShell>
  );
}
