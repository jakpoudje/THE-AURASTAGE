"use client";

// Multitrack timeline: ruler, playhead, one lane per track. Planned cues are
// dashed outlines (no sound yet); recordings show their real waveform. Drag a
// clip sideways to move it (saved on release); click to select.

import { useRef, useState } from "react";
import type { AudioClip, AudioTrack } from "@aurastage/contracts";
import { peaks } from "../state/mixEngine";

const FAMILY_COLOR: Record<string, string> = {
  DX: "bg-sky-500/25 border-sky-400/60", ADR: "bg-sky-500/25 border-sky-400/60", VO: "bg-cyan-500/25 border-cyan-400/60",
  FOLEY: "bg-amber-500/25 border-amber-400/60", FX: "bg-orange-500/25 border-orange-400/60", WALLA: "bg-orange-500/25 border-orange-400/60",
  BG: "bg-emerald-500/20 border-emerald-400/50", MX: "bg-fuchsia-500/20 border-fuchsia-400/50", SCORE: "bg-violet-500/25 border-violet-400/60",
};
const HEADER = 180;

function Wave({ buf, clip, width }: { buf: AudioBuffer; clip: AudioClip; width: number }) {
  const n = Math.max(8, Math.min(400, Math.floor(width / 2)));
  const p = peaks(buf, n, clip.offset_seconds, clip.duration_seconds);
  const d = p.map((v, i) => `M${(i / n) * 100} ${50 - v * 48} L${(i / n) * 100} ${50 + v * 48}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-white/70" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Timeline({
  seconds, tracks, clips, buffers, pps, position, selectedClipId, busy, onSelectClip, onMoveClip, onSeek, onTrackChange,
}: {
  seconds: number; tracks: AudioTrack[]; clips: AudioClip[]; buffers: Map<string, AudioBuffer>; pps: number; position: number;
  selectedClipId: string | null; busy: boolean;
  onSelectClip: (id: string | null) => void; onMoveClip: (id: string, start: number) => void; onSeek: (t: number) => void;
  onTrackChange: (id: string, patch: { mute?: boolean; solo?: boolean }) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; x0: number; start0: number; start: number } | null>(null);
  const moved = useRef(false);
  const width = Math.max(600, Math.ceil(seconds * pps));
  const ticks = Array.from({ length: Math.floor(seconds) + 1 }, (_, i) => i).filter((i) => pps >= 40 || i % 5 === 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-aura-border bg-black/30" aria-label="Timeline">
      <div style={{ width: width + HEADER }} className="relative">
        {/* Ruler */}
        <div className="flex h-7 border-b border-aura-border text-[10px] text-white/40">
          <div style={{ width: HEADER }} className="shrink-0 px-2 py-1.5">Tracks</div>
          <div
            className="relative flex-1 cursor-pointer"
            onClick={(e) => onSeek(Math.max(0, Math.min(seconds, (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)))}
            aria-label="Ruler"
          >
            {ticks.map((i) => (
              <span key={i} style={{ left: i * pps }} className="absolute top-0 h-full border-l border-white/10 pl-1 pt-1.5">
                {i}s
              </span>
            ))}
          </div>
        </div>
        {tracks.map((t) => (
          <div key={t.id} className="flex h-14 border-b border-aura-border/60" role="group" aria-label={`Track ${t.name}`}>
            <div style={{ width: HEADER }} className="flex shrink-0 items-center gap-1.5 border-r border-aura-border bg-aura-panel px-2">
              <span className="min-w-0 flex-1 truncate text-xs">{t.name}</span>
              <button
                aria-label={`Mute ${t.name}`}
                aria-pressed={t.mute}
                disabled={busy}
                onClick={() => onTrackChange(t.id, { mute: !t.mute })}
                className={`h-5 w-5 rounded text-[10px] font-bold ${t.mute ? "bg-red-500 text-black" : "border border-aura-border text-white/50"}`}
              >
                M
              </button>
              <button
                aria-label={`Solo ${t.name}`}
                aria-pressed={t.solo}
                disabled={busy}
                onClick={() => onTrackChange(t.id, { solo: !t.solo })}
                className={`h-5 w-5 rounded text-[10px] font-bold ${t.solo ? "bg-aura-gold text-black" : "border border-aura-border text-white/50"}`}
              >
                S
              </button>
            </div>
            <div className="relative flex-1" onClick={() => !moved.current && onSelectClip(null)}>
              {clips
                .filter((c) => c.track_id === t.id)
                .map((c) => {
                  const start = drag?.id === c.id ? drag.start : c.start_seconds;
                  const w = Math.max(6, c.duration_seconds * pps);
                  const buf = c.asset_id ? buffers.get(c.asset_id) : undefined;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      aria-label={`Clip ${c.label}`}
                      title={`${c.label} · ${c.kind === "cue" ? "planned — no audio yet" : "recording"} · ${start.toFixed(2)}s`}
                      style={{ left: start * pps, width: w }}
                      className={`absolute top-1.5 h-11 cursor-grab overflow-hidden rounded border text-[10px] ${FAMILY_COLOR[t.family] ?? ""} ${c.kind === "cue" ? "border-dashed bg-transparent" : ""} ${selectedClipId === c.id ? "ring-2 ring-aura-gold" : ""}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                        moved.current = false;
                        setDrag({ id: c.id, x0: e.clientX, start0: c.start_seconds, start: c.start_seconds });
                      }}
                      onPointerMove={(e) => {
                        if (drag?.id !== c.id) return;
                        const dx = e.clientX - drag.x0;
                        if (Math.abs(dx) > 3) moved.current = true;
                        setDrag({ ...drag, start: Math.max(0, Math.round((drag.start0 + dx / pps) * 100) / 100) });
                      }}
                      // The lane's click deselects; a click on a clip must not reach it.
                      onClick={(e) => e.stopPropagation()}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        const d = drag;
                        setDrag(null);
                        if (d && moved.current && d.start !== d.start0) onMoveClip(c.id, d.start);
                        else onSelectClip(c.id);
                        setTimeout(() => (moved.current = false), 0);
                      }}
                    >
                      {buf && <Wave buf={buf} clip={c} width={w} />}
                      <span className="relative block truncate px-1 pt-0.5 text-white/90">{c.label}</span>
                      {c.kind === "cue" && <span className="relative block px-1 text-[9px] uppercase text-white/40">planned</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
        <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-aura-gold" style={{ left: HEADER + position * pps }} aria-hidden />
      </div>
    </div>
  );
}
