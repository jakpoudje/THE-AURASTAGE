"use client";

// apps/web/src/modules/scene-dna/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Scene DNA workspace (docs/design/UI_REFERENCE.md §6).
// Canonical backend authority: apps/api/src/modules/scene-dna
// Engine domain: engines/scene-dna

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSceneDna } from "./hooks/useSceneDna";
import { dnaStatus, SceneList } from "./components/SceneList";
import { SceneEditor } from "./components/SceneEditor";
import { ReadinessPanel } from "./components/ReadinessPanel";
import { DriftBanner } from "./components/DriftBanner";

export default function SceneDnaPage() {
  const { id } = useParams<{ id: string }>();
  const d = useSceneDna(id);
  // ?scene=<id> (e.g. from Scriptwriter → Scene Breakdown) opens that scene.
  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("scene")));
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((v: boolean) => setDirty(v), []);

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening Scene DNA…</div>;
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
  const entry = ws.scenes.find((s) => s.scene.id === selectedId) ?? ws.scenes[0] ?? null;

  function select(sceneId: string) {
    if (dirty && sceneId !== entry?.scene.id && !window.confirm("You have unsaved changes in this scene. They're kept on this device — switch anyway?")) return;
    setSelectedId(sceneId);
  }

  return (
    <AppShell
      project={d.project}
      active="scene-dna"
      actions={
        <>
          <Link href={`/projects/${id}/dialogue`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Dialogue
          </Link>
          <Link href={`/projects/${id}/storyboard`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Storyboard →
          </Link>
        </>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Scene DNA</p>
        <h1 className="mt-2 font-display text-4xl">
          Turn Every Scene into a <span className="text-aura-gold">Production Blueprint</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Everything the crew needs to know about each scene, in one place: who is in it, what they say and feel, what it
          looks and sounds like. Built from your approved script, cast and dialogue — then locked, so later stages build
          from a fixed version.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50" aria-label="How this page works">
          <span className="rounded-md border border-aura-border px-3 py-1.5">Scriptwriter{ws.script ? ` · approved v${ws.script.version_number}` : ""}</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-border px-3 py-1.5">Casting</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-border px-3 py-1.5">Dialogue</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Scene DNA</span>
          <Link href={`/projects/${id}/storyboard`} className="text-white/50 underline hover:text-aura-gold">
            → Storyboard
          </Link>
        </div>

        {!ws.script ? (
          <div className="rounded-xl border border-dashed border-aura-border p-5 text-sm text-white/60">
            Scene DNA is built from your approved script.{" "}
            <Link href={`/projects/${id}/scriptwriter`} className="text-aura-gold underline">
              Write and approve it in Scriptwriter →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-white/60">
            <span className="text-emerald-300">{ws.summary.approved}</span> of {ws.summary.scenes} scenes locked ·{" "}
            {ws.summary.ready} ready to lock
            {ws.summary.needs_review > 0 && <span className="text-aura-gold"> · {ws.summary.needs_review} need review after upstream changes</span>}
          </p>
        )}

        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}

        {entry && (
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
            <SceneList entries={ws.scenes} selectedId={entry.scene.id} onSelect={select} />

            <div className="space-y-4">
              <DriftBanner record={entry.record} />
              <div className="rounded-xl border border-aura-border bg-aura-panel">
                <div className="flex flex-wrap items-center gap-3 border-b border-aura-border p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                      Scene {entry.scene.number} · {entry.scene.int_ext === "UNKNOWN" ? "INT/EXT not set" : entry.scene.int_ext} · {entry.scene.time_of_day ?? "time not set"} ·{" "}
                      {Math.round(entry.scene.estimated_seconds)} s
                    </p>
                    <h2 className="truncate font-display text-xl">{entry.scene.heading}</h2>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase ${dnaStatus(entry).tone}`}>{dnaStatus(entry).label}</span>
                </div>
                <SceneEditor
                  key={`${entry.scene.id}:${entry.record?.updated_at ?? "new"}`}
                  entry={entry}
                  busy={d.busy === "save"}
                  onSave={(input) => d.save(entry.scene.id, input)}
                  onDirtyChange={onDirtyChange}
                />
              </div>
            </div>

            <div className="space-y-4">
              <ReadinessPanel entry={entry} dirty={dirty} busy={d.busy === "approve"} onApprove={() => d.approve(entry.scene.id)} />
              <div className="rounded-xl border border-aura-border bg-aura-panel p-4 text-sm">
                <h3 className="font-display text-lg">Where this comes from</h3>
                <ul className="mt-2 space-y-1.5 text-white/60">
                  <li>
                    Scene text —{" "}
                    <Link className="text-aura-gold underline" href={`/projects/${id}/scriptwriter`}>
                      Scriptwriter
                    </Link>
                  </li>
                  <li>
                    Characters & wardrobe looks —{" "}
                    <Link className="text-aura-gold underline" href={`/projects/${id}/casting`}>
                      Casting
                    </Link>
                  </li>
                  <li>
                    Lines, emotion & intent —{" "}
                    <Link className="text-aura-gold underline" href={`/projects/${id}/dialogue`}>
                      Dialogue
                    </Link>
                  </li>
                </ul>
                {entry.record?.approved_version_number && (
                  <p className="mt-3 text-xs text-white/40">Locked version {entry.record.approved_version_number} is kept in history.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
