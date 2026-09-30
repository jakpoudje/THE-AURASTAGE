"use client";

// apps/web/src/modules/dialogue-intelligence/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Dialogue Intelligence workspace (docs/design/UI_REFERENCE.md §5).
// Canonical backend authority: apps/api/src/modules/dialogue
// Engine domain: engines/dialogue

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useDialogue } from "./hooks/useDialogue";
import { DialogueSyncBanner } from "./components/DialogueSyncBanner";
import { SceneList } from "./components/SceneList";
import { IntentSuggestions, LineCard } from "./components/LineCard";
import { EmotionArc } from "./components/EmotionArc";
import { VoicePanel } from "./components/VoicePanel";
import { QualityChecks } from "./components/QualityChecks";
import { askAuraStage } from "@/modules/ask-aurastage/askBus";

export default function DialogueIntelligencePage() {
  const { id } = useParams<{ id: string }>();
  const d = useDialogue(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOmitted, setShowOmitted] = useState(false);

  const ws = d.ws;
  const scenes = useMemo(() => (ws ? ws.scenes.filter((s) => s.status === "active" || ws.lines.some((l) => l.scene_id === s.id)) : []), [ws]);
  const firstWithLines = scenes.find((s) => ws?.lines.some((l) => l.scene_id === s.id && l.status === "active"));
  const scene = scenes.find((s) => s.id === selectedId) ?? firstWithLines ?? scenes[0] ?? null;

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening Dialogue Intelligence…</div>;
  if (!d.project || !ws) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{d.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const names = new Map(ws.characters.map((c) => [c.id, c.name]));
  const sceneLines = scene ? ws.lines.filter((l) => l.scene_id === scene.id) : [];
  const activeLines = sceneLines.filter((l) => l.status === "active");
  const omittedLines = sceneLines.filter((l) => l.status === "omitted");
  const starts: number[] = [];
  activeLines.reduce((t, l, i) => ((starts[i] = t), t + l.estimated_seconds), 0);
  const speakerKeys = new Set(activeLines.map((l) => l.speaker_key));
  const sceneVoiceprints = ws.analysis.voiceprints.filter((v) => speakerKeys.has(v.speaker_key));
  const balance = scene ? ws.analysis.balance.find((b) => b.scene_number === scene.number) : undefined;
  const unresolvedHere = [...new Set(activeLines.filter((l) => !l.character_id).map((l) => l.speaker_name))];
  // Show Casting's canonical names wherever the analysis speaks about a speaker.
  const nameByKey = new Map(ws.lines.filter((l) => l.character_id && names.has(l.character_id)).map((l) => [l.speaker_key, names.get(l.character_id!)!]));
  const displayName = (key: string, fallback: string) => nameByKey.get(key) ?? fallback;
  const allApproved = activeLines.length > 0 && activeLines.every((l) => l.approval === "approved" && l.review_state === "current");

  return (
    <AppShell
      project={d.project}
      active="dialogue"
      actions={
        <>
          <Link href={`/projects/${id}/world`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Locations & Props
          </Link>
          <Link href={`/projects/${id}/scene-dna`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Scene DNA →
          </Link>
        </>
      }
    >
      <IntentSuggestions />
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Dialogue Intelligence</p>
        <h1 className="mt-2 font-display text-4xl">
          Give Your Characters <span className="text-aura-gold">Authentic Voices</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Every spoken line from your approved script, ready to annotate with intent, emotion and subtext. The words
          stay owned by the script; here you shape what they mean and how they're played.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span className="rounded-md border border-aura-border px-3 py-1.5">Scriptwriter{ws.script ? ` · approved v${ws.script.version_number}` : ""}</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-border px-3 py-1.5">Casting · {ws.characters.length} characters</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Dialogue Intelligence</span>
          <Link href={`/projects/${id}/scene-dna`} className="text-white/50 underline hover:text-aura-gold">
            → Scene DNA
          </Link>
        </div>

        <DialogueSyncBanner ws={ws} projectId={id} busy={d.busy === "sync"} onSync={d.sync} />

        {ws.analysis.review_required > 0 && (
          <div className="rounded-md border border-aura-gold/40 px-4 py-2 text-sm text-aura-gold">
            {ws.analysis.review_required} {ws.analysis.review_required === 1 ? "line needs" : "lines need"} review after script changes.
          </div>
        )}
        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}

        {ws.lines.length === 0 ? (
          ws.sync.state !== "no_script" && (
            <div className="rounded-xl border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
              No dialogue yet. Use “Bring in dialogue” above.
            </div>
          )
        ) : (
          <>
          <div role="group" aria-label="Whole film" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-aura-border bg-aura-panel p-3 text-sm">
            <span className="text-white/60">Whole film:</span>
            <button onClick={() => askAuraStage("Fill the performance of every line in the film from the script: only empty fields.", { task: "annotate_all_lines" })}
              className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-aura-gold">Fill every line in the film (free)</button>
            {(() => {
              const todo = scenes.filter((s) => ws.lines.some((l) => l.scene_id === s.id && l.status === "active" && !(l.approval === "approved" && l.review_state === "current"))).map((s) => s.id);
              return (
                <button disabled={!todo.length || d.busy !== null}
                  onClick={() => window.confirm(`Approve the dialogue of ${todo.length} scene(s)? You can still edit any line afterwards.`) && d.approveAll(todo)}
                  className="rounded-md bg-aura-gold px-3 py-1.5 font-medium text-black disabled:opacity-40">Approve every scene&apos;s dialogue ({todo.length})</button>
              );
            })()}
          </div>
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
            <SceneList scenes={scenes} lines={ws.lines} selectedId={scene?.id ?? null} onSelect={setSelectedId} />

            <div className="rounded-xl border border-aura-border bg-aura-panel">
              {scene && (
                <>
                  <div className="flex flex-wrap items-center gap-3 border-b border-aura-border p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-widest text-white/40">Scene {scene.number}</p>
                      <h2 className="truncate font-display text-xl">{scene.heading}</h2>
                    </div>
                    {activeLines.length > 0 && (
                      <button
                        onClick={() => askAuraStage(`Fill the performance of every line in scene ${scene.number} from the script: emotion, intensity, intention, subtext and delivery.`, { task: "annotate_scene", object: { type: "scene", id: scene.id, label: `Scene ${scene.number}` } })}
                        title="Free — AuraStage reads every line and the scene. Only empty fields; you see every change before it's saved."
                        className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold"
                      >
                        Fill every line&apos;s performance (free)
                      </button>
                    )}
                    <button
                      onClick={() => d.approveScene(scene.id)}
                      disabled={d.busy !== null || activeLines.length === 0 || allApproved}
                      className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
                    >
                      {allApproved ? "Scene approved ✓" : "Approve scene dialogue"}
                    </button>
                  </div>
                  <ul className="space-y-3 p-4">
                    {activeLines.length === 0 && <li className="text-sm text-white/40">No dialogue in this scene.</li>}
                    {activeLines.map((l, i) => (
                      <LineCard
                        key={`${l.id}:${l.updated_at}`}
                        line={l}
                        startSeconds={starts[i]}
                        speakerName={(l.character_id && names.get(l.character_id)) || l.speaker_name}
                        listenerNames={l.listener_ids.map((x) => names.get(x)).filter((x): x is string => !!x)}
                        busy={d.busy !== null}
                        onSave={(input, message) => d.updateLine(l.id, input, message)}
                      />
                    ))}
                  </ul>
                  {omittedLines.length > 0 && (
                    <div className="border-t border-aura-border p-4">
                      <button onClick={() => setShowOmitted((s) => !s)} className="text-xs text-white/50 hover:text-white">
                        {showOmitted ? "Hide" : "Show"} {omittedLines.length} {omittedLines.length === 1 ? "line" : "lines"} no longer in the script
                      </button>
                      {showOmitted && (
                        <ul className="mt-3 space-y-3">
                          {omittedLines.map((l) => (
                            <LineCard key={`${l.id}:${l.updated_at}`} line={l} startSeconds={0} speakerName={(l.character_id && names.get(l.character_id)) || l.speaker_name} listenerNames={[]} busy={d.busy !== null} onSave={(input, m) => d.updateLine(l.id, input, m)} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4">
              <EmotionArc lines={activeLines} />
              <QualityChecks balance={balance} voiceprints={sceneVoiceprints} unresolved={unresolvedHere} projectId={id} displayName={displayName} />
              <VoicePanel voiceprints={sceneVoiceprints} displayName={displayName} />
            </div>
          </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
