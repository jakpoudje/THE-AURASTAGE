"use client";

// The full assembly at a glance: where the film is in the finishing steps (from the stored cut, its checks and its
// lock — never estimated), and one card per scene with its picture, sound and length. Click a scene to go to it.
import Link from "next/link";
import type { AutomationPoint, TimelineClip } from "@aurastage/contracts";
import { timelineAutomation } from "@aurastage/engines";
import { tc } from "../state/timelineMath";
import type { EditorialWorkspace } from "../types";

export interface SceneSpan { scene_id: string; number: number; heading: string; from: number; to: number }

/** Where each scene sits in the cut (from its picture clips, else its mix). */
export function sceneSpans(clips: TimelineClip[], bin: EditorialWorkspace["bin"]): SceneSpan[] {
  const out: SceneSpan[] = [];
  for (const b of bin) {
    const mine = clips.filter((c) => c.scene_id === b.scene_id);
    const pic = mine.filter((c) => c.track === "V1");
    const use = pic.length ? pic : mine;
    if (!use.length) continue;
    out.push({ scene_id: b.scene_id, number: b.number, heading: b.heading, from: Math.min(...use.map((c) => c.record_in)), to: Math.max(...use.map((c) => c.record_in + c.duration)) });
  }
  return out.sort((a, b) => a.from - b.from);
}

type StepState = "done" | "now" | "todo" | "optional";
const DOT: Record<StepState, string> = { done: "bg-emerald-400 text-black", now: "bg-aura-gold text-black", todo: "border border-white/20 text-white/40", optional: "border border-white/20 text-white/50" };

export function AssemblyGuide({ ws, projectId, clips, automation, fps, onSeek }: {
  ws: EditorialWorkspace; projectId: string; clips: TimelineClip[]; automation: AutomationPoint[]; fps: number; onSeek: (frame: number) => void;
}) {
  const t = ws.timeline;
  const offline = clips.filter((c) => c.track === "V1" && c.kind === "slug").length;
  const spans = sceneSpans(clips, ws.bin);
  const inCut = new Set(spans.map((s) => s.scene_id));
  const withSound = new Set(clips.filter((c) => c.track === "A1").map((c) => c.scene_id));
  const missingScenes = ws.bin.filter((b) => !inCut.has(b.scene_id)).length;
  const soundMissing = spans.filter((s) => !withSound.has(s.scene_id)).length;
  const locked = t?.status === "locked";
  const blocking = ws.qc.checks.filter((c) => c.blocking && !c.ok).length;
  const steps: { label: string; state: StepState; detail: string }[] = [
    { label: "Assemble", state: t ? "done" : "now", detail: t ? `${spans.length} of ${ws.bin.length} scene${ws.bin.length === 1 ? "" : "s"} in the cut` : "Build the first assembly" },
    { label: "Picture", state: !t ? "todo" : offline ? "now" : "done", detail: !t ? "—" : offline ? `${offline} shot${offline === 1 ? "" : "s"} still offline (no approved take)` : "Every shot has an approved take" },
    { label: "Sound", state: !t ? "todo" : soundMissing ? "now" : "done", detail: !t ? "—" : soundMissing ? `${soundMissing} scene${soundMissing === 1 ? "" : "s"} without a mix on A1` : "Every scene has its approved mix" },
    { label: "Levels", state: !t ? "todo" : "optional", detail: automation.length ? `${automation.length} volume point${automation.length === 1 ? "" : "s"} drawn` : "Optional: draw volume on the Volume lane" },
    { label: "Lock picture", state: locked ? "done" : t && !blocking ? "now" : "todo", detail: locked ? `Picture Lock ${t?.lock?.lock_number}` : blocking ? `${blocking} blocking check${blocking === 1 ? "" : "s"} to fix first` : t ? "Ready to lock" : "—" },
    { label: "Deliver", state: locked ? "now" : "todo", detail: locked ? "Render your deliverables" : "After Picture Lock" },
  ];

  return (
    <section className="rounded-xl border border-aura-border bg-aura-panel p-4" aria-label="Assembly overview">
      <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Finishing steps">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-2" data-state={s.state}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${DOT[s.state]}`}>{s.state === "done" ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <p className={`text-sm ${s.state === "now" ? "text-aura-gold" : ""}`}>
                {s.label}
                {s.label === "Deliver" && locked && (
                  <Link href={`/projects/${projectId}/export`} className="ml-2 text-xs text-aura-gold underline">
                    Export →
                  </Link>
                )}
              </p>
              <p className="text-[11px] text-white/50">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {t && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Scenes in the assembly">
          {ws.bin.map((b) => {
            const span = spans.find((s) => s.scene_id === b.scene_id);
            const shots = clips.filter((c) => c.track === "V1" && c.scene_id === b.scene_id);
            const off = shots.filter((c) => c.kind === "slug").length;
            const mix = clips.find((c) => c.track === "A1" && c.scene_id === b.scene_id);
            const level = span && automation.length ? timelineAutomation.automationDbAt(automation, (span.from + span.to) / 2) : null;
            return (
              <div key={b.scene_id} role="listitem" className="shrink-0">
              <button
                onClick={() => span && onSeek(span.from)}
                disabled={!span}
                aria-label={`Scene ${b.number} overview`}
                className="w-48 rounded-lg border border-aura-border bg-black/30 p-2 text-left text-[11px] hover:border-aura-gold/60 disabled:opacity-50"
              >
                <p className="truncate text-xs text-white/90">{b.number}. {b.heading}</p>
                {span ? (
                  <>
                    <p className={off ? "text-red-300" : "text-white/60"}>Picture: {shots.length} shot{shots.length === 1 ? "" : "s"}{off ? ` · ${off} offline` : ""}</p>
                    <p className={mix ? "text-white/60" : "text-aura-gold"}>Sound: {mix ? mix.label : b.mix_note ?? "no mix on A1"}</p>
                    <p className="font-mono text-white/40">{tc(span.from, fps)} · {((span.to - span.from) / fps).toFixed(1)} s{level !== null && level !== 0 ? ` · ${level > 0 ? "+" : ""}${level.toFixed(1)} dB` : ""}</p>
                  </>
                ) : (
                  <p className="text-aura-gold">Not in the cut{missingScenes ? " — re-assemble or place its shots" : ""}</p>
                )}
              </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
