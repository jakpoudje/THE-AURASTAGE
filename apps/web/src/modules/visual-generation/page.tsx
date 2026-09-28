"use client";

// apps/web/src/modules/visual-generation/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Visual Generation workspace (docs/design/UI_REFERENCE.md §8).
// Canonical backend authority: apps/api/src/modules/generation
// Provider calls: apps/api/src/providers via workers/image-worker only.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useVisual } from "./hooks/useVisual";
import { ShotRail, shotStatus } from "./components/ShotRail";
import { TakeViewer } from "./components/TakeViewer";
import { PromptPanel } from "./components/PromptPanel";
import { GenerationControls, ProviderList } from "./components/GenerationControls";

const SIZE: Record<string, string> = {
  EWS: "Extreme wide", WS: "Wide", FULL: "Full", MWS: "Medium wide", COWBOY: "Cowboy", MS: "Medium", MCU: "Medium close-up", CU: "Close-up",
  ECU: "Extreme close-up", TWO_SHOT: "Two-shot", THREE_SHOT: "Three-shot", GROUP: "Group", OTS: "Over the shoulder", POV: "POV", INSERT: "Insert", CUTAWAY: "Cutaway",
};

export default function VisualGenerationPage() {
  const { id } = useParams<{ id: string }>();
  const d = useVisual(id);
  const [shotId, setShotId] = useState<string | null>(null);

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening Visual Generation…</div>;
  if (!d.project || !d.ws) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{d.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  const ws = d.ws;
  const flat = ws.scenes.flatMap((sc) => sc.shots.map((s) => ({ sc, s })));
  const idx = Math.max(0, flat.findIndex((x) => x.s.shot.id === shotId));
  const cur = flat[idx] ?? null;

  return (
    <AppShell
      project={d.project}
      active="visual"
      actions={
        <>
          <Link href={`/projects/${id}/storyboard`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Storyboard
          </Link>
          <Link href={`/projects/${id}/audio`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Audio Studio →
          </Link>
        </>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Visual Generation</p>
        <h1 className="mt-2 font-display text-4xl">
          Turn Shot Plans into <span className="text-aura-gold">Stunning Visuals</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Every approved shot becomes a precise prompt built from your scene, cast and camera plan. Generate takes,
          compare them side by side, and approve the one that belongs in the film.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span className="rounded-md border border-aura-border px-3 py-1.5">Storyboard · {ws.summary.scenes} approved {ws.summary.scenes === 1 ? "plan" : "plans"}</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Visual Generation</span>
          <Link href={`/projects/${id}/audio`} className="text-white/50 underline hover:text-aura-gold">
            → Audio Studio
          </Link>
        </div>
        <p className="text-sm text-white/60">
          <span className="text-emerald-300">{ws.summary.with_approved_take}</span> of {ws.summary.shots} shots have an approved take · {ws.summary.takes} takes
          {d.inFlight && (
            <span className="text-sky-300">
              {" "}· {ws.queue.running} generating, {ws.queue.waiting} waiting
            </span>
          )}
        </p>
        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}

        {!cur ? (
          <div className="rounded-xl border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
            No approved shot plans yet.{" "}
            <Link href={`/projects/${id}/storyboard`} className="text-aura-gold underline">
              Approve a scene's shots in Storyboard →
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            <ShotRail ws={ws} selectedId={cur.s.shot.id} onSelect={setShotId} />

            <div className="space-y-4">
              <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => setShotId(flat[idx - 1]?.s.shot.id ?? null)} disabled={idx === 0} className="rounded border border-aura-border px-3 py-1 text-sm disabled:opacity-30">
                    ← Previous
                  </button>
                  <div className="min-w-0 flex-1 text-center">
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                      Scene {cur.sc.scene.number} · Shot {cur.s.shot.ordinal} · {SIZE[cur.s.shot.size] ?? cur.s.shot.size} · {cur.s.shot.duration_seconds}s
                    </p>
                    <h2 className="truncate font-display text-lg">{cur.s.shot.description}</h2>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase ${shotStatus(cur.s).tone}`}>{shotStatus(cur.s).label}</span>
                  <button onClick={() => setShotId(flat[idx + 1]?.s.shot.id ?? null)} disabled={idx >= flat.length - 1} className="rounded border border-aura-border px-3 py-1 text-sm disabled:opacity-30">
                    Next →
                  </button>
                </div>
                <TakeViewer
                  key={cur.s.shot.id}
                  takes={cur.s.takes}
                  busy={d.busy !== null}
                  onApprove={d.approve}
                  onReject={d.reject}
                  onReopen={d.reopen}
                  onCancel={d.cancel}
                />
              </div>
              <PromptPanel s={cur.s} usable={cur.sc.plan.usable} busy={d.busy === "compile"} onCompile={() => d.compile(cur.s.shot.id, ws.defaults?.aspect_ratio ?? "16:9")} />
            </div>

            <div className="space-y-4">
              <GenerationControls
                key={cur.s.shot.id}
                s={cur.s}
                providers={ws.providers}
                defaults={ws.defaults}
                budget={ws.budget}
                mediaReady={ws.media_ready}
                usable={cur.sc.plan.usable}
                busy={d.busy === "generate"}
                onGenerate={(input) => cur.s.package && d.generate(cur.s.package.id, input)}
              />
              <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
                <h3 className="font-display text-lg">Providers</h3>
                <div className="mt-3">
                  <ProviderList providers={ws.providers} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
