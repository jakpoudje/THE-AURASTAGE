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
import { GenerateScriptPanel, OutlinePanel, ScriptToolsPanel, StoryDevelopmentPanel } from "./components/AuraScript";
import { useWriting } from "./hooks/useWriting";
import { can, useProjectAccess } from "@/lib/useProjectAccess";

// Steps 2–4 are AuraScript (AI writing through the Provider Gateway, in the background worker); every result is
// checked and changes nothing until the writer applies it or opens it as a new draft version.
const STEPS: { key: ScriptwriterStep; label: string; needsAi?: boolean }[] = [
  { key: "setup", label: "Project Setup" },
  { key: "development", label: "Story Development", needsAi: true },
  { key: "outline", label: "Outline & Structure", needsAi: true },
  { key: "generate", label: "Generate Script", needsAi: true },
  { key: "edit", label: "Edit & Refine" },
  { key: "breakdown", label: "Scene Breakdown" },
  { key: "characters", label: "Character Extraction" },
];

export default function ScriptwriterPage() {
  const { id } = useParams<{ id: string }>();
  const sw = useScriptwriter(id);
  const w = useWriting(id);
  const access = useProjectAccess(id);
  const canWrite = can(access, "script", "edit");
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
        <>
        <button
          onClick={() => sw.saveVersion()}
          disabled={!sw.dirty || sw.busy !== null || sw.conflict}
          title={sw.dirty ? "Save a new version of the script" : "All changes saved"}
          className="rounded-md border border-aura-border px-4 py-2 text-sm disabled:opacity-40"
        >
          {sw.busy === "save" ? "Saving…" : sw.dirty ? "Save" : "Saved"}
        </button>
        {approvedId ? (
          <Link href={`/projects/${id}/casting`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Casting & Characters →
          </Link>
        ) : (
          <button onClick={() => setStep("edit")} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Open Script Editor →
          </button>
        )}
        </>
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
            {s.needsAi && <span className="rounded bg-aura-gold/15 px-1.5 text-[9px] uppercase text-aura-gold">AI</span>}
          </button>
        ))}
      </nav>

      {sw.recovered && (
        <div className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-md border border-aura-gold/40 px-4 py-2 text-sm text-aura-gold">
          <span className="flex-1">
            We kept your unsaved changes from {new Date(sw.recovered).toLocaleString()}. Save a version to keep them.
          </span>
          <button onClick={() => setStep("edit")} className="underline">
            Show me
          </button>
          <button onClick={sw.discardRecovered} className="text-white/60 hover:text-white">
            Discard them
          </button>
        </div>
      )}
      {sw.conflict && (
        <div className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-md border border-sky-400/40 px-4 py-2 text-sm text-sky-200">
          <span className="flex-1">A newer version was saved since you started. Your text can be saved after it — nothing is overwritten.</span>
          <button
            onClick={() => sw.saveVersion(undefined, true)}
            disabled={sw.busy !== null}
            className="rounded-md border border-sky-400/60 px-3 py-1 disabled:opacity-50"
          >
            Save mine as the newest version
          </button>
        </div>
      )}
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

        {(w.error || w.notice) && step !== "setup" && (
          <p role={w.error ? "alert" : "status"} className={`mb-4 rounded-md border px-4 py-2 text-sm ${w.error ? "border-red-400/40 text-red-300" : "border-emerald-400/40 text-emerald-300"}`}>{w.error ?? w.notice}</p>
        )}

        {step === "development" && <StoryDevelopmentPanel w={w} canEdit={canWrite} onApplied={() => sw.reload().catch(() => null)} />}

        {step === "outline" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <OutlinePanel w={w} canEdit={canWrite} />
            <ScopePlanPanel plan={sw.plan} actualScenes={sw.live.analysis.scene_count} />
          </div>
        )}

        {step === "generate" && (
          <GenerateScriptPanel w={w} canEdit={canWrite} currentVersionId={currentId} onOpened={async () => { await sw.reload(); setStep("edit"); }} />
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
              <ScriptToolsPanel w={w} projectId={id} canEdit={canWrite} sceneNumbers={sw.live.scenes.map((x) => x.number)} currentVersionId={currentId} dirty={sw.dirty}
                onOpened={() => sw.reload().catch(() => null)} />
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
