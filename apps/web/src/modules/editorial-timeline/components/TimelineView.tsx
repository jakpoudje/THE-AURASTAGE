"use client";

// Multi-track timeline (V2 inserts over the picture, V1 picture, A1 scene mixes, A2 music across scenes). Drag behaviour depends on
// the chosen tool; nothing changes locally — each gesture becomes ONE edit
// operation sent to the API (engines/editorial/editDecisionEngine).
import { useRef, useState } from "react";
import type { AutomationPoint, EditOperation, TimelineClip, TimelineTrack } from "@aurastage/contracts";
import { AutomationLane, LANE_HEIGHT } from "./AutomationLane";
import { clipEnd, onTrack, tc } from "../state/timelineMath";
import type { EditorialWorkspace, Tool } from "../types";

const HEADER = 96;
const EDGE = 7;
type Zone = "body" | "in" | "out";
interface Drag { id: string; zone: Zone; x0: number; dx: number }

const LANES: { track: TimelineTrack; name: string; note: string; h: string }[] = [
  { track: "V2", name: "Inserts", note: "shown over the picture", h: "h-12" },
  { track: "V1", name: "Picture", note: "approved takes, shot by shot", h: "h-20" },
  { track: "A1", name: "Sound", note: "each scene's approved mix", h: "h-12" },
  { track: "A2", name: "Music", note: "runs across scenes", h: "h-10" },
];

export function TimelineView({
  clips, fps, ppf, frame, length, selectedId, tool, issueIds, media, busy, onSeek, onSelect, onOp,
  scenes, automation, onAutomation,
}: {
  clips: TimelineClip[]; fps: number; ppf: number; frame: number; length: number; selectedId: string | null; tool: Tool;
  issueIds: Set<string>; media: EditorialWorkspace["media"]; busy: boolean;
  onSeek: (f: number) => void; onSelect: (id: string | null) => void; onOp: (op: EditOperation) => void;
  /** Scene spans on the cut, for the scene row (number, heading, first and last frame). */
  scenes: { scene_id: string; number: number; heading: string; from: number; to: number }[];
  automation: AutomationPoint[];
  onAutomation: (next: AutomationPoint[], summary: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const lane = useRef<HTMLDivElement>(null);
  const width = Math.max(800, (length + fps * 10) * ppf);
  const frameAt = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    return Math.max(0, Math.round((clientX - r.left - HEADER + lane.current!.scrollLeft) / ppf));
  };
  const step = ppf >= 6 ? fps : ppf >= 1.5 ? fps * 5 : fps * 30;

  function finish(c: TimelineClip, d: Drag, clientX: number) {
    const delta = Math.round(d.dx / ppf);
    if (tool === "blade") return onOp({ op: "blade", track: c.track, at: frameAt(clientX) });
    if (delta === 0) return onSelect(c.id);
    onSelect(c.id);
    if (tool === "select") {
      if (d.zone === "body") return onOp({ op: "move", clip_id: c.id, record_in: Math.max(0, c.record_in + delta) });
      return onOp({ op: "trim", clip_id: c.id, edge: d.zone, delta, ripple: false });
    }
    if (tool === "ripple" && d.zone !== "body") return onOp({ op: "trim", clip_id: c.id, edge: d.zone, delta, ripple: true });
    if (tool === "roll" && d.zone === "out") return onOp({ op: "roll", clip_id: c.id, delta });
    if (tool === "roll" && d.zone === "in") {
      const prev = onTrack(clips, c.track).find((x) => clipEnd(x) === c.record_in);
      if (prev) return onOp({ op: "roll", clip_id: prev.id, delta });
    }
    if (tool === "slip" && d.zone === "body") return onOp({ op: "slip", clip_id: c.id, delta: -delta });
    if (tool === "slide" && d.zone === "body") return onOp({ op: "slide", clip_id: c.id, delta });
  }

  const preview = (c: TimelineClip) => {
    let left = c.record_in * ppf, w = Math.max(3, c.duration * ppf);
    if (drag?.id === c.id) {
      const moves = (tool === "select" || tool === "slide") && drag.zone === "body";
      if (moves) left += drag.dx;
      if (drag.zone === "in" && tool !== "slip" && tool !== "slide") (left += drag.dx), (w -= drag.dx);
      if (drag.zone === "out" && tool !== "slip" && tool !== "slide") w += drag.dx;
    }
    return { left, w: Math.max(3, w) };
  };

  const rulerMarks = [];
  for (let f = 0; f <= length + fps * 10; f += step) rulerMarks.push(f);

  return (
    <div ref={lane} className="relative overflow-x-auto rounded-lg border border-aura-border bg-black/40" aria-label="Timeline">
      <div style={{ width: width + HEADER }} className="relative select-none">
        <div className="flex h-7 border-b border-aura-border text-[10px] text-white/40">
          <div style={{ width: HEADER }} className="shrink-0 border-r border-aura-border px-2 py-1.5">TC</div>
          <div className="relative flex-1 cursor-pointer" aria-label="Ruler" onClick={(e) => onSeek(frameAt(e.clientX))}>
            {rulerMarks.map((f) => (
              <span key={f} className="absolute top-0 h-full border-l border-white/10 pl-1 pt-1.5 font-mono" style={{ left: f * ppf }}>
                {tc(f, fps).slice(3, 8)}
              </span>
            ))}
          </div>
        </div>
        {/* Scenes: where each scene sits in the cut (click to go there). */}
        <div className="flex h-6 border-b border-aura-border/60 text-[10px]" role="group" aria-label="Scenes in the cut">
          <div style={{ width: HEADER }} className="shrink-0 border-r border-aura-border bg-aura-panel px-2 py-1 text-white/50">Scenes</div>
          <div className="relative flex-1">
            {scenes.map((sc, i) => (
              <button
                key={sc.scene_id}
                onClick={() => onSeek(sc.from)}
                title={`Scene ${sc.number} · ${sc.heading} · ${tc(sc.from, fps)} – ${tc(sc.to, fps)}`}
                aria-label={`Go to scene ${sc.number}`}
                style={{ left: sc.from * ppf, width: Math.max(14, (sc.to - sc.from) * ppf) }}
                className={`absolute inset-y-0.5 truncate rounded-sm px-1 text-left ${i % 2 ? "bg-white/10" : "bg-aura-gold/15"} text-white/80 hover:bg-aura-gold/30`}
              >
                {sc.number}. {sc.heading}
              </button>
            ))}
          </div>
        </div>
        {LANES.map(({ track, name, note, h }) => (
          <div key={track} role="group" aria-label={`Track ${track}`} className={`flex border-b border-aura-border/60 ${h}`}>
            <div style={{ width: HEADER }} className="flex shrink-0 flex-col justify-center border-r border-aura-border bg-aura-panel px-2 text-xs">
              <span className="font-medium">{name} <span className="text-white/40">{track}</span></span>
              <span className="text-[9px] leading-tight text-white/40">{note}</span>
            </div>
            <div className="relative flex-1" onClick={(e) => e.target === e.currentTarget && (onSelect(null), onSeek(frameAt(e.clientX)))}>
              {onTrack(clips, track).map((c) => {
                const { left, w } = preview(c);
                const m = c.take_id ? media[c.take_id] : undefined;
                const img = m?.url && m.capability === "image" ? m.url : null;
                const issue = issueIds.has(c.id);
                const zoneOf = (e: React.PointerEvent) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const x = e.clientX - r.left;
                  return x < EDGE ? "in" : x > r.width - EDGE ? "out" : "body";
                };
                return (
                  <div
                    key={c.id}
                    role="button"
                    aria-label={`Clip ${c.label}`}
                    aria-pressed={selectedId === c.id}
                    title={`${c.label}\n${tc(c.record_in, fps)} – ${tc(clipEnd(c), fps)} (${c.duration} frames)${c.kind === "slug" ? "\nOFFLINE — no approved media" : ""}`}
                    style={{ left, width: w, backgroundImage: img ? `url("${img}")` : undefined }}
                    className={`absolute top-1 bottom-1 overflow-hidden rounded border bg-cover bg-center text-[10px] ${busy ? "pointer-events-none opacity-70" : ""} ${
                      tool === "blade" ? "cursor-crosshair" : "cursor-grab"
                    } ${
                      c.kind === "slug"
                        ? "border-red-400/70 bg-[repeating-linear-gradient(45deg,#2a0d0d,#2a0d0d_6px,#1a0808_6px,#1a0808_12px)]"
                        : c.kind === "audio_mix"
                          ? "border-emerald-500/60 bg-emerald-900/40"
                          : c.kind === "music"
                            ? "border-fuchsia-400/60 bg-fuchsia-900/40"
                            : c.track === "V2"
                              ? "border-amber-300/70 bg-amber-900/40"
                              : "border-sky-400/50 bg-sky-900/40"
                    } ${issue ? "outline outline-2 outline-aura-gold" : ""} ${selectedId === c.id ? "ring-2 ring-white" : ""}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      setDrag({ id: c.id, zone: zoneOf(e), x0: e.clientX, dx: 0 });
                    }}
                    onPointerMove={(e) => drag?.id === c.id && setDrag({ ...drag, dx: e.clientX - drag.x0 })}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      const d = drag;
                      setDrag(null);
                      if (d?.id === c.id) finish(c, d, e.clientX);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="absolute inset-y-0 left-0 w-[7px] cursor-ew-resize bg-white/0 hover:bg-white/30" aria-hidden />
                    <span className="absolute inset-y-0 right-0 w-[7px] cursor-ew-resize bg-white/0 hover:bg-white/30" aria-hidden />
                    <span className="relative block truncate bg-black/60 px-1 py-0.5 text-white/90">
                      {issue && <span className="mr-1 text-aura-gold">!</span>}
                      {c.label}
                    </span>
                    {c.kind === "slug" && <span className="relative block px-1 text-[9px] font-bold text-red-300">OFFLINE</span>}
                    {drag?.id === c.id && Math.round(drag.dx / ppf) !== 0 && (
                      <span className="absolute bottom-0.5 right-1 rounded bg-black/80 px-1 font-mono text-aura-gold">
                        {Math.round(drag.dx / ppf) > 0 ? "+" : ""}
                        {Math.round(drag.dx / ppf)}f
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div role="group" aria-label="Track Volume" className="flex border-b border-aura-border/60" style={{ height: LANE_HEIGHT }}>
          <div style={{ width: HEADER }} className="flex shrink-0 flex-col justify-center border-r border-aura-border bg-aura-panel px-2 text-xs">
            <span className="font-medium">Volume <span className="text-white/40">A1</span></span>
            <span className="text-[9px] leading-tight text-white/40">{tool === "draw" ? "drag to draw the level" : "click: add · drag: move · double-click: remove"}</span>
          </div>
          <div className="relative flex-1">
            <AutomationLane points={automation} fps={fps} ppf={ppf} width={width} draw={tool === "draw"} busy={busy} onChange={onAutomation} />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-aura-gold" style={{ left: HEADER + frame * ppf }} aria-hidden />
      </div>
    </div>
  );
}
