"use client";

// Program monitor: the V1 frame under the playhead with its grade preview.
import { useEffect, useRef } from "react";
import type { TimelineClip } from "@aurastage/contracts";
import { gradeFilter, tc } from "../state/timelineMath";
import type { EditorialWorkspace } from "../types";

export function Viewer({ clip, frame, fps, length, playing, media }: { clip: TimelineClip | null; frame: number; fps: number; length: number; playing: boolean; media: EditorialWorkspace["media"] }) {
  const m = clip?.take_id ? media[clip.take_id] : undefined;
  const video = useRef<HTMLVideoElement>(null);
  const t = clip ? (clip.source_in + frame - clip.record_in) / fps : 0;
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (!playing || Math.abs(v.currentTime - t) > 0.25) v.currentTime = t;
    if (playing && v.paused) v.play().catch(() => null);
    if (!playing && !v.paused) v.pause();
  }, [t, playing]);
  const temp = clip?.grade.temperature ?? 0;
  return (
    <div className="overflow-hidden rounded-xl border border-aura-border bg-black">
      <div className="relative aspect-video w-full" aria-label="Viewer">
        {!clip ? (
          <div className="flex h-full items-center justify-center text-sm text-white/30">{length ? "Black — no picture here" : "Nothing on the timeline yet"}</div>
        ) : clip.kind === "slug" ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(45deg,#1d0a0a,#1d0a0a_10px,#120606_10px,#120606_20px)] text-center">
            <span className="text-xs font-bold tracking-widest text-red-300">OFFLINE</span>
            <span className="max-w-md px-4 text-sm text-white/70">{clip.label}</span>
          </div>
        ) : m?.url && m.capability === "video" ? (
          <video ref={video} src={m.url} muted playsInline className="h-full w-full object-contain" style={{ filter: gradeFilter(clip.grade) }} />
        ) : m?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url} alt={clip.label} className="h-full w-full object-contain" style={{ filter: gradeFilter(clip.grade) }} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/40">Media link unavailable — reload</div>
        )}
        {temp !== 0 && clip?.kind === "take" && (
          <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ background: temp > 0 ? "#ff9a3c" : "#3c8dff", opacity: Math.abs(temp) * 0.35 }} aria-hidden />
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-aura-border px-3 py-1.5 font-mono text-sm tabular-nums">
        <span aria-label="Timecode">{tc(frame, fps)}</span>
        <span className="flex flex-1 justify-center gap-1 font-sans text-[10px]">
          <span className="rounded border border-aura-border px-1.5 py-0.5 text-white/60">{fps} fps</span>
          <span className="rounded border border-aura-border px-1.5 py-0.5 text-white/60">16:9</span>
          {clip?.kind === "take" && m && <span className="rounded border border-aura-border px-1.5 py-0.5 text-white/60">Take V{m.take_number}</span>}
        </span>
        <span className="text-white/40">{tc(length, fps)}</span>
      </div>
    </div>
  );
}
