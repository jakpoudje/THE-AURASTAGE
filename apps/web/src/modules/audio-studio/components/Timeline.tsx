"use client";

// Multitrack timeline: ruler, playhead, one lane per track. Planned cues are
// dashed outlines (no sound yet); recordings show their real waveform. Drag a
// clip sideways to move it (saved on release); click to select. Tracks can be added (any department), renamed,
// reordered and — when added by hand and empty — removed.

import { useRef, useState } from "react";
import type { AudioClip, AudioTrack } from "@aurastage/contracts";
import { peaks } from "../state/mixEngine";

const FAMILY_COLOR: Record<string, string> = {
  DX: "bg-sky-500/25 border-sky-400/60", ADR: "bg-sky-500/25 border-sky-400/60", VO: "bg-cyan-500/25 border-cyan-400/60",
  FOLEY: "bg-amber-500/25 border-amber-400/60", FX: "bg-orange-500/25 border-orange-400/60", WALLA: "bg-orange-500/25 border-orange-400/60",
  BG: "bg-emerald-500/20 border-emerald-400/50", MX: "bg-fuchsia-500/20 border-fuchsia-400/50", SCORE: "bg-violet-500/25 border-violet-400/60",
};
const HEADER = 236;
export const FAMILY_LABEL: Record<string, string> = {
  DX: "Dialogue", ADR: "ADR", VO: "Voice-over", FOLEY: "Foley", FX: "Effects", WALLA: "Walla", BG: "Backgrounds", MX: "Music", SCORE: "Score",
};

/** Header row under the lanes: name a new track and choose its department (it routes to that department's bus). */
function AddTrackRow({ busy, onAdd }: { busy: boolean; onAdd: (name: string, family: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [family, setFamily] = useState("FX");
  const submit = async () => {
    if (!name.trim()) return;
    if (await onAdd(name.trim(), family)) setName("");
  };
  return (
    <div className="flex items-center gap-2 border-b border-aura-border/60 bg-aura-panel/60 px-2 py-2 text-xs" role="group" aria-label="Add a track">
      <span className="text-white/50">New track</span>
      <input aria-label="New track name" value={name} maxLength={80} placeholder="e.g. Radio, Crowd, Rain on glass"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
        className="w-56 rounded border border-aura-border bg-black/30 px-2 py-1" />
      <select aria-label="New track department" value={family} onChange={(e) => setFamily(e.target.value)} className="rounded border border-aura-border bg-black/30 px-2 py-1">
        {Object.entries(FAMILY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <button onClick={submit} disabled={busy || !name.trim()} className="rounded border border-aura-gold/60 px-3 py-1 text-aura-gold disabled:opacity-40">+ Add track</button>
      <span className="text-white/40">Tracks you add stay when the scene is re-spotted.</span>
    </div>
  );
}

/** Track name: click to choose it for new clips, double-click (or ✎) to rename. */
function TrackName({ t, selected, busy, onSelect, onRename }: { t: AudioTrack; selected: boolean; busy: boolean; onSelect: () => void; onRename: (name: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit !== null)
    return (
      <input autoFocus aria-label={`Rename ${t.name}`} value={edit} maxLength={80} onChange={(e) => setEdit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }}
        onBlur={() => { const n = (edit ?? "").trim(); setEdit(null); if (n && n !== t.name) onRename(n); }}
        className="min-w-0 flex-1 rounded border border-aura-gold/60 bg-black/40 px-1 text-xs" />
    );
  return (
    <>
      <button onClick={onSelect} onDoubleClick={() => !busy && setEdit(t.name)} aria-pressed={selected} title={`${FAMILY_LABEL[t.family] ?? t.family} · click to put new clips here, double-click to rename`}
        className={`min-w-0 flex-1 truncate text-left text-xs ${selected ? "text-aura-gold" : ""}`}>
        {t.name}
        <span className="ml-1 text-[9px] uppercase text-white/35">{t.added_by_hand ? "yours" : FAMILY_LABEL[t.family] ?? t.family}</span>
      </button>
      <button aria-label={`Rename ${t.name}`} disabled={busy} onClick={() => setEdit(t.name)} className="text-[10px] text-white/40 hover:text-white">✎</button>
    </>
  );
}

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
  seconds, tracks, clips, buffers, pps, position, selectedClipId, busy, onSelectClip, onMoveClip, onSeek, onTrimClip, onTrackChange,
  selectedTrackId, onSelectTrack, onAddTrack, onMoveTrack, onRemoveTrack,
}: {
  seconds: number; tracks: AudioTrack[]; clips: AudioClip[]; buffers: Map<string, AudioBuffer>; pps: number; position: number;
  selectedClipId: string | null; busy: boolean;
  onSelectClip: (id: string | null) => void; onMoveClip: (id: string, start: number) => void; onSeek: (t: number) => void;
  /** Trim by dragging a clip's edge: the new start/offset/length (2026-10-02). */
  onTrimClip?: (id: string, patch: { start_seconds?: number; offset_seconds?: number; duration_seconds: number }) => void;
  onTrackChange: (id: string, patch: { mute?: boolean; solo?: boolean; name?: string }) => void;
  selectedTrackId: string | null; onSelectTrack: (id: string) => void;
  onAddTrack: (name: string, family: string) => Promise<unknown>; onMoveTrack: (id: string, direction: -1 | 1) => void; onRemoveTrack: (id: string) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; x0: number; start0: number; start: number } | null>(null);
  // Edge trims: which edge, where the pointer started, and the clip as it was.
  const [trim, setTrim] = useState<{ id: string; edge: "in" | "out"; x0: number; c: AudioClip; max: number; start: number; offset: number; duration: number } | null>(null);
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
        {tracks.map((t, ti) => (
          <div key={t.id} className="flex h-14 border-b border-aura-border/60" role="group" aria-label={`Track ${t.name}`}>
            <div style={{ width: HEADER }} className={`flex shrink-0 items-center gap-1 border-r border-aura-border px-2 ${selectedTrackId === t.id ? "bg-aura-gold/10" : "bg-aura-panel"}`}>
              <TrackName t={t} selected={selectedTrackId === t.id} busy={busy} onSelect={() => onSelectTrack(t.id)} onRename={(name) => onTrackChange(t.id, { name })} />
              <button aria-label={`Move ${t.name} up`} disabled={busy || ti === 0} onClick={() => onMoveTrack(t.id, -1)} className="text-[10px] text-white/50 disabled:opacity-20">▲</button>
              <button aria-label={`Move ${t.name} down`} disabled={busy || ti === tracks.length - 1} onClick={() => onMoveTrack(t.id, 1)} className="text-[10px] text-white/50 disabled:opacity-20">▼</button>
              {t.added_by_hand && (
                <button aria-label={`Remove ${t.name}`} disabled={busy} title="Remove this track (only when it has no clips)" onClick={() => onRemoveTrack(t.id)} className="text-[11px] text-white/40 hover:text-red-300">✕</button>
              )}
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
                  const tr = trim?.id === c.id ? trim : null;
                  const start = drag?.id === c.id ? drag.start : tr ? tr.start : c.start_seconds;
                  const w = Math.max(6, (tr ? tr.duration : c.duration_seconds) * pps);
                  const edge = (which: "in" | "out") => (
                    <span
                      aria-label={`Trim ${which === "in" ? "start" : "end"} of ${c.label}`}
                      className={`absolute top-0 z-10 h-full w-1.5 cursor-ew-resize bg-white/0 hover:bg-aura-gold/70 ${which === "in" ? "left-0" : "right-0"}`}
                      onPointerDown={(e) => {
                        if (busy || !onTrimClip) return;
                        e.stopPropagation();
                        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                        const b = c.asset_id ? buffers.get(c.asset_id) : undefined;
                        setTrim({ id: c.id, edge: which, x0: e.clientX, c, max: b ? b.duration : Infinity, start: c.start_seconds, offset: c.offset_seconds, duration: c.duration_seconds });
                      }}
                      onPointerMove={(e) => {
                        if (!trim || trim.id !== c.id || trim.edge !== which) return;
                        const d = Math.round(((e.clientX - trim.x0) / pps) * 100) / 100;
                        const o = trim.c;
                        if (which === "in") {
                          // Moving the start in or out: the recording slides with it (offset), the end stays put.
                          const dd = Math.max(-Math.min(o.start_seconds, o.offset_seconds), Math.min(d, o.duration_seconds - 0.1));
                          setTrim({ ...trim, start: o.start_seconds + dd, offset: o.offset_seconds + dd, duration: Math.round((o.duration_seconds - dd) * 100) / 100 });
                        } else {
                          const room = o.kind === "asset" ? trim.max - o.offset_seconds : 3600;
                          setTrim({ ...trim, duration: Math.max(0.1, Math.min(room, Math.round((o.duration_seconds + d) * 100) / 100)) });
                        }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        const t2 = trim;
                        setTrim(null);
                        if (!t2 || t2.id !== c.id) return;
                        if (t2.edge === "in" && t2.start !== c.start_seconds) onTrimClip?.(c.id, { start_seconds: Math.round(t2.start * 100) / 100, offset_seconds: Math.round(t2.offset * 100) / 100, duration_seconds: t2.duration });
                        if (t2.edge === "out" && t2.duration !== c.duration_seconds) onTrimClip?.(c.id, { duration_seconds: t2.duration });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  );
                  const buf = c.asset_id ? buffers.get(c.asset_id) : undefined;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      aria-label={`Clip ${c.label}`}
                      title={`${c.label} · ${c.kind === "cue" ? "planned — no audio yet" : "recording"} · ${start.toFixed(2)}s`}
                      style={{ left: start * pps, width: w }}
                      data-muted={c.muted ? "true" : undefined}
                      className={`absolute top-1.5 h-11 cursor-grab overflow-hidden rounded border text-[10px] ${FAMILY_COLOR[t.family] ?? ""} ${c.kind === "cue" ? "border-dashed bg-transparent" : ""} ${c.muted ? "opacity-35 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.08)_4px,rgba(255,255,255,0.08)_8px)]" : ""} ${selectedClipId === c.id ? "ring-2 ring-aura-gold" : ""}`}
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
                      {edge("in")}
                      {edge("out")}
                      <span className={`relative block truncate px-1 pt-0.5 text-white/90 ${c.muted ? "line-through" : ""}`}>{c.label}</span>
                      {c.muted && <span className="relative block px-1 text-[9px] uppercase text-red-300">muted</span>}
                      {c.kind === "cue" && <span className="relative block px-1 text-[9px] uppercase text-white/40">planned</span>}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
        <AddTrackRow busy={busy} onAdd={onAddTrack} />
        <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-aura-gold" style={{ left: HEADER + position * pps }} aria-hidden />
      </div>
    </div>
  );
}
