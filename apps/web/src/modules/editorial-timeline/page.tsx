"use client";

// apps/web/src/modules/editorial-timeline/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Editorial & Timeline workspace (docs/design/UI_REFERENCE.md §10).
// Canonical backend authority: apps/api/src/modules/editorial
// Engines: engines/editorial (assembly, edit operations, QC, Picture Lock impact, EDL)

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditOperation } from "@aurastage/contracts";
import { AppShell } from "@/components/AppShell";
import { useEditorial } from "./hooks/useEditorial";
import { TimelineView } from "./components/TimelineView";
import { Viewer } from "./components/Viewer";
import { Bin } from "./components/Bin";
import { Inspector } from "./components/Inspector";
import { BreakLockDialog, QCPanel, VersionsPanel } from "./components/Panels";
import { AssemblyGuide, sceneSpans } from "./components/AssemblyGuide";
import { AutomationPanel } from "./components/AutomationPanel";
import { TimelinePlayer } from "./state/playback";
import { clipAt, timelineLength, tc } from "./state/timelineMath";
import type { Tool } from "./types";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select", hint: "Drag a clip to move it, drag an edge to trim (no ripple)" },
  { id: "ripple", label: "Ripple", hint: "Drag an edge to trim; everything after follows on all tracks" },
  { id: "roll", label: "Roll", hint: "Drag a cut point: one clip gets longer, the next shorter" },
  { id: "slip", label: "Slip", hint: "Drag a video clip to show a different part of its take" },
  { id: "slide", label: "Slide", hint: "Drag a clip between its neighbours" },
  { id: "blade", label: "Blade", hint: "Click a clip to cut it in two (B cuts at the playhead)" },
  { id: "draw", label: "✎ Draw volume", hint: "Drag across the Volume lane to draw the level of the whole cut's sound" },
];

export default function EditorialPage() {
  const { id } = useParams<{ id: string }>();
  const d = useEditorial(id);
  const fps = d.ws?.fps ?? 24;
  const [frame, setFrame] = useState(0);
  const [ppf, setPpf] = useState(2);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const player = useRef<TimelinePlayer | null>(null);
  if (!player.current) player.current = new TimelinePlayer(24);

  const clips = useMemo(() => d.ws?.clips ?? [], [d.ws]);
  const length = timelineLength(clips);
  const issueIds = useMemo(() => new Set((d.ws?.issues ?? []).map((i) => i.clip_id)), [d.ws]);
  const clip = clips.find((c) => c.id === selected) ?? null;
  const canEdit = !!d.ws?.timeline;
  const automation = useMemo(() => d.ws?.timeline?.automation?.A1 ?? [], [d.ws]);
  const spans = useMemo(() => sceneSpans(clips, d.ws?.bin ?? []), [clips, d.ws]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const f = player.current!.position();
      setFrame(f);
      if (f >= length) {
        player.current!.stop();
        setPlaying(false);
        setFrame(length);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, length]);
  useEffect(() => () => player.current?.stop(), []);

  async function togglePlay() {
    if (!d.ws) return;
    if (player.current!.playing) {
      player.current!.stop();
      setPlaying(false);
      return;
    }
    const from = frame >= length ? 0 : frame;
    setFrame(from);
    await player.current!.play(from, clips, d.ws.mixes, automation);
    setPlaying(true);
  }
  const seek = (f: number) => {
    player.current!.stop();
    setPlaying(false);
    setFrame(Math.max(0, Math.min(f, Math.max(length, 0))));
  };
  const edit = (op: EditOperation) => {
    player.current!.stop();
    setPlaying(false);
    return d.edit(op);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.code === "Space") (e.preventDefault(), togglePlay());
      else if (e.key === "ArrowRight") (e.preventDefault(), seek(frame + (e.shiftKey ? fps : 1)));
      else if (e.key === "ArrowLeft") (e.preventDefault(), seek(frame - (e.shiftKey ? fps : 1)));
      else if ((e.key === "b" || e.key === "B") && canEdit && d.busy === null) edit({ op: "blade", track: "V1", at: frame });
      else if ((e.key === "Delete" || e.key === "Backspace") && selected && d.busy === null) {
        e.preventDefault();
        edit(e.shiftKey ? { op: "extract", clip_id: selected } : { op: "lift", clip_id: selected });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (d.loading) return <div className="p-12 text-center text-white/50">Opening Editorial…</div>;
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
  const t = ws.timeline;
  // What the viewer shows: an insert over the picture (V2) wins while it lasts.
  const onPicture = clipAt(clips, "V2", frame) ?? clipAt(clips, "V1", frame);
  const issueFor = (cid: string) => ws.issues.find((i) => i.clip_id === cid)?.message ?? null;

  return (
    <AppShell
      project={d.project}
      active="editorial"
      comments={{
        objectType: "Timeline",
        objectId: t?.id ?? id,
        objectVersion: t?.revision ?? null,
        objectLabel: "the timeline",
        anchor: { frame, timecode: tc(frame, fps) },
        onJump: (a) => typeof a.frame === "number" && seek(a.frame),
      }}
      actions={
        <>
          <Link href={`/projects/${id}/audio`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Audio Studio
          </Link>
          <Link href={`/projects/${id}/export`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Export & Deliver →
          </Link>
        </>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Editorial & Timeline</p>
        <h1 className="mt-2 font-display text-4xl">
          Assemble, Edit and <span className="text-aura-gold">Perfect Your Film</span>
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Your whole film in one place: every scene's approved shots on the Picture track, its approved mix on the Sound track, and a Volume lane to
          draw or set the level of the final sound. Trim, ripple, roll, slip, slide and blade the cut, then lock the picture and deliver.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span className="rounded-md border border-aura-border px-3 py-1.5">Visual Generation + Audio Studio · approved takes & mixes</span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Editorial & Timeline</span>
          <span className="text-white/30">→ Export & Deliver</span>
        </div>
        {(d.error || d.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${d.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>{d.error ?? d.notice}</div>
        )}
        {t && (t.review_state !== "current" || ws.conformable > 0) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-aura-gold/40 px-4 py-3 text-sm text-aura-gold">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.review_state !== "current" ? "Upstream changes need review." : "New approved takes or mixes are available."}</p>
              <p className="mt-1 text-xs opacity-90">
                {t.review_reason ?? `${ws.conformable} clip${ws.conformable === 1 ? "" : "s"} can use a newly approved take or mix. Your cut stays exactly as it is until you conform.`}
              </p>
            </div>
            {ws.conformable > 0 && (
              <button onClick={() => edit({ op: "conform" })} disabled={d.busy !== null} className="rounded-md border border-aura-gold px-3 py-1.5 text-sm disabled:opacity-40">
                Conform to approved takes & mixes
              </button>
            )}
          </div>
        )}

        {ws.bin.length > 0 && <AssemblyGuide ws={ws} projectId={id} clips={clips} automation={automation} fps={fps} onSeek={seek} />}

        {!ws.bin.length ? (
          <div className="rounded-xl border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
            No scenes with an approved shot plan yet.{" "}
            <Link href={`/projects/${id}/storyboard`} className="text-aura-gold underline">
              Approve a scene's shots in Storyboard →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
            <Bin bin={ws.bin} media={ws.media} music={ws.music_library ?? []} canEdit={canEdit} busy={d.busy !== null} onPlace={(source, mode) => edit({ op: mode, at: frame, source })} />

            <div className="min-w-0 space-y-3">
              <Viewer clip={onPicture} frame={frame} fps={fps} length={length} playing={playing} media={ws.media} />
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-aura-border bg-aura-panel p-2">
                <button
                  onClick={() => (!t || !clips.length || window.confirm("Re-assemble from approved shots? Your current cut is kept as a version first.")) && d.assemble()}
                  disabled={d.busy !== null}
                  className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-sm text-aura-gold disabled:opacity-40"
                >
                  {d.busy === "assemble" ? "Assembling…" : t ? "Re-assemble" : "Build first assembly"}
                </button>
                {t && (
                  <>
                    <button onClick={togglePlay} aria-label={playing ? "Stop" : "Play"} className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black">
                      {playing ? "■ Stop" : "▶ Play"}
                    </button>
                    <button onClick={() => seek(0)} className="rounded border border-aura-border px-2 py-1 text-xs">⏮</button>
                    <span className="font-mono text-sm tabular-nums" aria-label="Playhead">{tc(frame, fps)}</span>
                    <div className="flex overflow-hidden rounded-md border border-aura-border" role="radiogroup" aria-label="Edit tool">
                      {TOOLS.map((x) => (
                        <button
                          key={x.id}
                          role="radio"
                          aria-checked={tool === x.id}
                          title={x.hint}
                          onClick={() => setTool(x.id)}
                          className={`px-2 py-1 text-xs ${tool === x.id ? "bg-aura-gold text-black" : "text-white/70 hover:bg-white/5"}`}
                        >
                          {x.label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1 text-xs text-white/50">
                      Zoom
                      <input aria-label="Zoom" type="range" min={0.25} max={12} step={0.25} value={ppf} onChange={(e) => setPpf(Number(e.target.value))} />
                    </label>
                    <span className="flex-1" />
                    <button onClick={d.exportEdl} disabled={!clips.length || d.busy !== null} className="rounded border border-aura-border px-3 py-1.5 text-xs disabled:opacity-40">
                      Export EDL
                    </button>
                  </>
                )}
              </div>
              {t ? (
                <>
                  <TimelineView
                    clips={clips} fps={fps} ppf={ppf} frame={frame} length={length} selectedId={selected} tool={tool} issueIds={issueIds} media={ws.media}
                    busy={d.busy !== null} onSeek={seek} onSelect={setSelected} onOp={edit}
                    scenes={spans} automation={automation} onAutomation={(pts, summary) => d.saveAutomation(pts, summary)}
                    cues={ws.sound_cues ?? []} audioHref={`/projects/${id}/audio`}
                  />
                  <p className="text-[11px] text-white/40">
                    {TOOLS.find((x) => x.id === tool)!.hint}. Space plays, ←/→ step a frame (Shift: a second), B cuts at the playhead, Delete lifts and Shift+Delete extracts the selected clip. Sync lock is on: ripple edits move picture and sound together.
                  </p>
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-aura-border p-8 text-center text-sm text-white/50">
                  Build the first assembly to cut every approved scene, shot by shot, with its approved mix underneath.
                </p>
              )}
            </div>

            <div className="space-y-4">
              {clip && <Inspector key={`${clip.id}:${JSON.stringify(clip)}`} clip={clip} fps={fps} issue={issueFor(clip.id)} busy={d.busy !== null} onOp={edit} />}
              {t && (
                <AutomationPanel points={automation} frame={frame} fps={fps} busy={d.busy !== null} onChange={(pts, summary) => d.saveAutomation(pts, summary)}
                  selection={clip ? { from: clip.record_in, to: clip.record_in + clip.duration, label: clip.label } : null} />
              )}
              {t && <VersionsPanel ws={ws} busy={d.busy} onSave={d.saveVersion} onRestore={(vid, label) => window.confirm(`Restore “${label}”? The current cut is kept as a version first.`) && d.restore(vid)} onLock={d.lock} />}
              <QCPanel qc={ws.qc} onJump={(f, cid) => (seek(f), setSelected(cid))} />
            </div>
          </div>
        )}
      </div>
      {d.pendingBreak && <BreakLockDialog pending={d.pendingBreak} busy={d.busy !== null} onConfirm={() => d.pendingBreak!.retry()} onCancel={d.cancelBreak} />}
    </AppShell>
  );
}
