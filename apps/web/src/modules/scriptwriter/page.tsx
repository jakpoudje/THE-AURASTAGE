"use client";

// apps/web/src/modules/scriptwriter/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Scriptwriter workspace (docs/design/UI_REFERENCE.md §3).
// Canonical backend authority: apps/api/src/modules/screenplay
// Engine domain: engines/story

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useScriptwriter } from "./hooks/useScriptwriter";
import { ProjectSetupForm } from "./components/ProjectSetupForm";
import { ScopePlanPanel } from "./components/ScopePlanPanel";
import { ScriptEditor } from "./components/ScriptEditor";
import { ScriptAnalysisPanel } from "./components/ScriptAnalysisPanel";
import { VersionHistory } from "./components/VersionHistory";
import { SceneBreakdown } from "./components/SceneBreakdown";
import { CharacterCandidates } from "./components/CharacterCandidates";
import type { ScriptwriterStep } from "./types";

// Steps 2 and 4 need an AI writing provider, which arrives with the Provider
// Gateway (build phase 7). They are listed so the flow matches the design, but
// they say so plainly instead of pretending to work.
const STEPS: { key: ScriptwriterStep; label: string; needsAi?: boolean }[] = [
  { key: "setup", label: "Project Setup" },
  { key: "development", label: "Story Development", needsAi: true },
  { key: "outline", label: "Outline & Structure" },
  { key: "generate", label: "Generate Script", needsAi: true },
  { key: "edit", label: "Edit & Refine" },
  { key: "breakdown", label: "Scene Breakdown" },
  { key: "characters", label: "Character Extraction" },
];

export default function ScriptwriterPage() {
  const { id } = useParams<{ id: string }>();
  const sw = useScriptwriter(id);
  const [step, setStep] = useState<ScriptwriterStep>("setup");

  if (sw.loading) return <div className="p-12 text-center text-white/50">Opening Scriptwriter…</div>;
  if (!sw.project) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{sw.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const ws = sw.workspace;
  const approvedId = ws?.script?.approved_version_id ?? null;
  const currentId = ws?.current_version?.id ?? null;

  return (
    <AppShell
      project={sw.project}
      active="scriptwriter"
      actions={
        <button
          onClick={() => setStep("edit")}
          className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black"
        >
          Open Script Editor →
        </button>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Scriptwriter</p>
        <h1 className="mt-2 font-display text-4xl">
          Turn Your Ideas into a <span className="text-aura-gold">Powerful Screenplay</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Set up your story, plan it against your runtime, write and refine the screenplay, then approve it so every
          later stage works from the same scenes.
        </p>
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-aura-border px-6">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(s.key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm ${
              step === s.key ? "border-aura-gold text-aura-gold" : "border-transparent text-white/60 hover:text-white"
            }`}
          >
            <span className="text-xs">{i + 1}</span>
            {s.label}
            {s.needsAi && <span className="rounded bg-white/5 px-1.5 text-[9px] uppercase text-white/40">AI · soon</span>}
          </button>
        ))}
      </nav>

      {(sw.error || sw.notice) && (
        <div className={`mx-6 mt-4 rounded-md border px-4 py-2 text-sm ${sw.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>
          {sw.error ?? sw.notice}
        </div>
      )}

      <div className="p-6">
        {step === "setup" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ProjectSetupForm key={sw.project.updated_at} project={sw.project} busy={sw.busy === "setup"} onSave={sw.saveSetup} />
            <ScopePlanPanel plan={sw.plan} actualScenes={sw.live.analysis.scene_count} />
          </div>
        )}

        {step === "outline" && <ScopePlanPanel plan={sw.plan} actualScenes={sw.live.analysis.scene_count} />}

        {(step === "development" || step === "generate") && (
          <div className="max-w-2xl rounded-xl border border-dashed border-aura-border p-8">
            <h2 className="font-display text-xl">{STEPS.find((s) => s.key === step)!.label}</h2>
            <p className="mt-2 text-sm text-white/60">
              AI story development and script generation will switch on once an AI writing service is connected to
              The AuraStage. Until then, write, paste or import (Final Draft or Fountain) your screenplay in Edit & Refine — everything else on this page
              already works with it.
            </p>
            <button onClick={() => setStep("edit")} className="mt-4 rounded-md border border-aura-gold/60 px-4 py-2 text-sm text-aura-gold">
              Go to Edit & Refine →
            </button>
          </div>
        )}

        {step === "edit" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <ScriptEditor
              draft={sw.draft}
              setDraft={sw.setDraft}
              elements={sw.live.elements}
              dirty={sw.dirty}
              busy={sw.busy}
              canApprove={!!currentId && currentId !== approvedId}
              approved={!!currentId && currentId === approvedId}
              onSave={sw.saveVersion}
              onApprove={sw.approveCurrent}
              onImport={sw.importFile}
            />
            <div className="space-y-4">
              <ScriptAnalysisPanel analysis={sw.live.analysis} />
              <VersionHistory versions={ws?.versions ?? []} currentId={currentId} approvedId={approvedId} />
            </div>
          </div>
        )}

        {step === "breakdown" && <SceneBreakdown scenes={ws?.scenes ?? []} draftScenes={sw.live.scenes} />}

        {step === "characters" && <CharacterCandidates analysis={sw.live.analysis} />}
      </div>
    </AppShell>
  );
}
