"use client";

// apps/web/src/modules/storyboard-shots/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Storyboard & Shots workspace (docs/design/UI_REFERENCE.md §7).
// Canonical backend authority: apps/api/src/modules/shots
// Engine domain: engines/cinematography

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useStoryboard } from "./hooks/useStoryboard";
import { planStatus, SceneList } from "./components/SceneList";
import { StoryboardGrid } from "./components/StoryboardGrid";
import { ShotListTable } from "./components/ShotListTable";
import { ShotEditor } from "./components/ShotEditor";
import { PlanPanel } from "./components/PlanPanel";
import { ShotTimeline } from "./components/ShotTimeline";

const TABS = ["Storyboard", "Shot List"] as const;

export default function StoryboardShotsPage() {
  const { id } = useParams<{ id: string }>();
  const d = useStoryboard(id);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [shotId, setShotId] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Storyboard");

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening Storyboard & Shots…</div>;
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
  const s = ws.scenes.find((x) => x.scene.id === sceneId) ?? ws.scenes.find((x) => x.dna.state === "locked") ?? ws.scenes[0] ?? null;
  const shot = s?.shots.find((x) => x.id === shotId) ?? null;

  async function addShot() {
    if (!s) return;
    const after = shot ?? s.shots[s.shots.length - 1] ?? null;
    const start = after ? after.story_end : 0;
    const created = await d.addShot(
      s.scene.id,
      {
        purpose: "insert", size: "MS", angle: "eye", movement: "static", support: "tripod", focus: "deep", lens_mm: 40,
        duration_seconds: 2, description: "New shot — describe what we see.", composition: null, lighting: null,
        transition_in: "cut", notes: null, character_ids: [], dialogue_line_ids: [], story_start: start, story_end: start + 2,
      },
      after ? after.ordinal : null
    );
    if (created) setShotId(created.id);
  }

  return (
    <AppShell
      project={d.project}
      active="storyboard"
      actions={
        <Link href={`/projects/${id}/scene-dna`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
          ← Scene DNA
        </Link>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Storyboard & Shots</p>
        <h1 className="mt-2 font-display text-4xl">
          Plan Every Shot with <span className="text-aura-gold">Cinematic Precision</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Turn each locked scene into a shot list: size, angle, movement, lens and timing for every shot, checked so every
          line and every moment of the scene is covered.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span className="rounded-md border border-aura-border px-3 py-1.5">Scene DNA · {ws.summary.dna_locked} of {ws.summary.scenes} locked</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Storyboard & Shots</span>
          <span className="text-white/30">→ Visual Generation</span>
        </div>
        <p className="text-sm text-white/60">
          <span className="text-emerald-300">{ws.summary.approved}</span> of {ws.summary.scenes} scenes have an approved shot plan · {ws.summary.shots} shots
          {ws.summary.needs_review > 0 && <span className="text-aura-gold"> · {ws.summary.needs_review} need review after Scene DNA changes</span>}
        </p>
        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}

        {ws.scenes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
            No scenes yet.{" "}
            <Link href={`/projects/${id}/scriptwriter`} className="text-aura-gold underline">
              Write and approve your script first →
            </Link>
          </div>
        ) : (
          s && (
            <>
              <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
                <SceneList scenes={ws.scenes} selectedId={s.scene.id} onSelect={(x) => (setSceneId(x), setShotId(null))} />

                <div className="space-y-4">
                  {s.plan && s.plan.review_state !== "current" && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${s.plan.review_state === "stale" ? "border-red-400/40 text-red-200" : "border-aura-gold/40 text-aura-gold"}`}>
                      <p className="font-medium">These shots need review.</p>
                      <p className="mt-1 text-xs opacity-90">{s.plan.review_reason}</p>
                      <p className="mt-1 text-xs opacity-70">Nothing was deleted. Re-plan from the new Scene DNA or adjust the shots, then approve again.</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-aura-border bg-aura-panel">
                    <div className="flex flex-wrap items-center gap-3 border-b border-aura-border p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-widest text-white/40">
                          Scene {s.scene.number} · {s.scene.int_ext} · {s.scene.time_of_day ?? "time not set"}
                          {s.dna.duration_seconds ? ` · ${Math.round(s.dna.duration_seconds)} s` : ""}
                        </p>
                        <h2 className="truncate font-display text-xl">{s.scene.heading}</h2>
                      </div>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase ${planStatus(s).tone}`}>{planStatus(s).label}</span>
                    </div>
                    <div className="flex items-center gap-1 border-b border-aura-border px-4 pt-3" role="tablist">
                      {TABS.map((t) => (
                        <button
                          key={t}
                          role="tab"
                          aria-selected={tab === t}
                          onClick={() => setTab(t)}
                          className={`rounded-t-md px-3 py-2 text-sm ${tab === t ? "border-b-2 border-aura-gold text-aura-gold" : "text-white/50 hover:text-white"}`}
                        >
                          {t}
                        </button>
                      ))}
                      <span className="flex-1" />
                      {s.plan && (
                        <button onClick={addShot} disabled={d.busy !== null} className="mb-2 rounded-md border border-aura-border px-3 py-1 text-xs disabled:opacity-40">
                          + Add shot{shot ? ` after ${shot.ordinal}` : ""}
                        </button>
                      )}
                    </div>
                    <div className="p-4">
                      {s.shots.length === 0 ? (
                        <p className="py-8 text-center text-sm text-white/40">
                          {s.dna.state === "locked" ? "No shots yet — use “Plan shots from Scene DNA” to start." : "Lock this scene's Scene DNA to plan its shots."}
                        </p>
                      ) : tab === "Storyboard" ? (
                        <StoryboardGrid shots={s.shots} selectedId={shot?.id ?? null} onSelect={setShotId} />
                      ) : (
                        <ShotListTable shots={s.shots} selectedId={shot?.id ?? null} onSelect={setShotId} />
                      )}
                    </div>
                    {shot && (
                      <div className="border-t border-aura-border">
                        <ShotEditor
                          key={`${shot.id}:${shot.updated_at}:${shot.ordinal}`}
                          shot={shot}
                          scene={s}
                          count={s.shots.length}
                          busy={d.busy !== null}
                          onSave={(input) => d.updateShot(shot.id, input)}
                          onMove={(dir) => d.moveShot(shot.id, dir)}
                          onDelete={async () => {
                            if (await d.deleteShot(shot.id)) setShotId(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <PlanPanel s={s} projectId={id} busy={d.busy} onGenerate={() => d.generate(s.scene.id)} onApprove={() => d.approve(s.scene.id)} />
              </div>
              <ShotTimeline shots={s.shots} selectedId={shot?.id ?? null} onSelect={setShotId} />
            </>
          )
        )}
      </div>
    </AppShell>
  );
}
