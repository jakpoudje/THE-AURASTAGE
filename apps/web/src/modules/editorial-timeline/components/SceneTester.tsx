"use client";

// One scene at a time (owner request 2026-10-02: "I want to just test one scene in the editorial and timeline"). Pick a
// scene and see, from the stored records, what it needs: an approved shot plan, an approved take for each shot, an
// approved sound mix — each with a link to the page that does it, for this scene. Then: build a test cut of this scene
// only (the current cut is kept as a version first), bring just this scene up to date (Conform, explained in plain
// words), and play it. The whole-film buttons stay at the top of the page for doing everything at once.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TimelineClip } from "@aurastage/contracts";
import type { EditorialWorkspace } from "../types";
import { sceneSpans } from "./AssemblyGuide";

export function SceneTester({ ws, projectId, clips, busy, onBuildScene, onConformScene, onPlayScene }: {
  ws: EditorialWorkspace; projectId: string; clips: TimelineClip[]; busy: boolean;
  onBuildScene: (sceneId: string) => void; onConformScene: (sceneId: string) => void; onPlayScene: (from: number, to: number) => void;
}) {
  const [sceneId, setSceneId] = useState<string>(ws.bin[0]?.scene_id ?? "");
  useEffect(() => {
    if (!ws.bin.some((b) => b.scene_id === sceneId)) setSceneId(ws.bin[0]?.scene_id ?? "");
  }, [ws.bin, sceneId]);
  const b = ws.bin.find((x) => x.scene_id === sceneId);
  if (!b) return null;
  const span = sceneSpans(clips, ws.bin).find((s) => s.scene_id === b.scene_id);
  const approved = b.shots.filter((s) => s.take).length;
  const onCut = clips.filter((c) => c.scene_id === b.scene_id && c.track === "V1");
  const soundOnCut = clips.some((c) => c.scene_id === b.scene_id && c.track === "A1");
  const pending = ws.conform_by_scene?.[b.scene_id] ?? { takes: 0, sound: 0 };
  const changes = pending.takes + pending.sound;
  const only = ws.timeline && onCut.length && clips.filter((c) => c.track === "V1").every((c) => c.scene_id === b.scene_id);
  const steps: { ok: boolean; label: string; detail: string; fix?: { href: string; text: string } }[] = [
    { ok: !!b.plan?.usable, label: "Shot plan approved", detail: b.plan ? (b.plan.usable ? `Plan v${b.plan.version_number}` : "Changes waiting for approval") : "No approved shot plan",
      fix: b.plan?.usable ? undefined : { href: `/projects/${projectId}/storyboard`, text: "Open Storyboard" } },
    { ok: b.shots.length > 0 && approved === b.shots.length, label: "Every shot has an approved take", detail: `${approved} of ${b.shots.length} shot${b.shots.length === 1 ? "" : "s"}${approved < b.shots.length ? " — the rest play as offline slugs" : ""}`,
      fix: approved < b.shots.length ? { href: `/projects/${projectId}/visual`, text: "Open Visual Generation" } : undefined },
    { ok: !!b.mix, label: "Sound mix approved", detail: b.mix ? `Mix v${b.mix.version_number} (${b.mix.seconds.toFixed(1)} s)` : b.mix_note ?? "No approved mix yet",
      fix: b.mix ? undefined : { href: `/projects/${projectId}/audio?scene=${b.scene_id}`, text: "Open this scene in Audio Studio" } },
    { ok: !!span && soundOnCut && changes === 0, label: "On the timeline, up to date",
      detail: !span ? "Not on the timeline yet" : changes ? `${[pending.takes ? `${pending.takes} newer approved take${pending.takes === 1 ? "" : "s"}` : "", pending.sound ? "newly approved sound" : ""].filter(Boolean).join(" and ")} waiting` : soundOnCut ? "Picture and sound in the cut" : "Picture in the cut, no sound yet" },
  ];

  return (
    <section className="rounded-xl border border-aura-border bg-aura-panel p-4" aria-label="One scene at a time">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">One scene at a time</h2>
        <label className="text-xs text-white/60">
          Scene{" "}
          <select aria-label="Scene to test" value={sceneId} onChange={(e) => setSceneId(e.target.value)} className="ml-1 max-w-[22rem] rounded border border-aura-border bg-black/40 px-2 py-1 text-xs">
            {ws.bin.map((x) => <option key={x.scene_id} value={x.scene_id}>{x.number}. {x.heading}</option>)}
          </select>
        </label>
        <span className="text-[11px] text-white/40">Test a single scene here; the buttons at the top do the whole film.</span>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label={`Scene ${b.number} readiness`}>
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-2 text-xs" data-ok={s.ok}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.ok ? "bg-emerald-400 text-black" : "bg-aura-gold text-black"}`}>{s.ok ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <p>{s.label}</p>
              <p className="text-[11px] text-white/50">{s.detail}</p>
              {s.fix && <Link href={s.fix.href} className="text-[11px] text-aura-gold underline">{s.fix.text} →</Link>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button disabled={busy || !b.plan} onClick={() => (!ws.timeline || !clips.length || window.confirm(`Build a test cut of Scene ${b.number} only? Your current cut is kept as a version first (Versions → restore brings it back).`)) && onBuildScene(b.scene_id)}
          className="rounded-md border border-aura-gold px-3 py-1.5 text-xs text-aura-gold disabled:opacity-40">
          {only ? `Rebuild Scene ${b.number}` : `Build a test cut of Scene ${b.number} only`}
        </button>
        <button disabled={busy || !span || changes === 0} onClick={() => onConformScene(b.scene_id)}
          title="Conform swaps in this scene's newest approved takes and adds its approved sound, without moving any cut points or your edits."
          className="rounded-md border border-aura-border px-3 py-1.5 text-xs disabled:opacity-40">
          Bring Scene {b.number} up to date{changes ? ` (${changes} change${changes === 1 ? "" : "s"})` : ""}
        </button>
        <button disabled={!span} onClick={() => span && onPlayScene(span.from, span.to)} className="rounded-md bg-aura-gold px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40">
          ▶ Play Scene {b.number}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-white/45">
        “Bring up to date” is what Editorial calls <em>Conform</em>: when a newer take of a shot or a newly approved sound mix exists, it replaces the
        old one in the same place — your cuts, trims and volume stay exactly as they are.
      </p>
    </section>
  );
}
