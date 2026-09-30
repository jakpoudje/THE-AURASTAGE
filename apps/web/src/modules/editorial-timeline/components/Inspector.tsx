"use client";

// Selected clip: exact timecodes, precise trims/slip, grade, lift/extract.
import { useState } from "react";
import type { ClipGrade, ClipTransition, EditOperation, TimelineClip } from "@aurastage/contracts";
import { clipEnd, tc } from "../state/timelineMath";

const GRADE: { k: keyof ClipGrade; label: string; min: number; max: number }[] = [
  { k: "exposure", label: "Exposure", min: -2, max: 2 },
  { k: "contrast", label: "Contrast", min: -1, max: 1 },
  { k: "saturation", label: "Saturation", min: -1, max: 1 },
  { k: "temperature", label: "Temperature", min: -1, max: 1 },
];

export function Inspector({ clip, fps, issue, busy, onOp }: { clip: TimelineClip; fps: number; issue: string | null; busy: boolean; onOp: (op: EditOperation) => void }) {
  const [delta, setDelta] = useState(0);
  const [ripple, setRipple] = useState(false);
  const [grade, setGrade] = useState<ClipGrade>(clip.grade);
  const dirtyGrade = JSON.stringify(grade) !== JSON.stringify(clip.grade);
  const baseT: ClipTransition = clip.transition ?? { in: "cut", out: "cut", frames: 12 };
  const [trans, setTrans] = useState<ClipTransition>(baseT);
  const dirtyTrans = JSON.stringify(trans) !== JSON.stringify(baseT);
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-2">
      <dt className="text-white/40">{k}</dt>
      <dd className="font-mono tabular-nums">{v}</dd>
    </div>
  );
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-3" aria-label="Clip details">
      <h3 className="font-display text-lg">{clip.label}</h3>
      {issue && <p className="mt-1 text-xs text-aura-gold">{issue}</p>}
      <dl className="mt-2 space-y-0.5 text-xs">
        {row("Track", clip.track)}
        {row("Record in", tc(clip.record_in, fps))}
        {row("Record out", tc(clipEnd(clip), fps))}
        {row("Length", `${clip.duration} f (${(clip.duration / fps).toFixed(2)}s)`)}
        {row("Source in", tc(clip.source_in, fps))}
        {row("Source", clip.kind === "slug" ? "Offline" : clip.source_frames === null ? "Still image" : `${clip.source_frames} f`)}
      </dl>
      <div className="mt-3 border-t border-aura-border pt-3">
        <label className="flex items-center justify-between gap-2 text-xs">
          Frames
          <input aria-label="Frames" type="number" value={delta} onChange={(e) => setDelta(Math.trunc(Number(e.target.value)))} className="w-20 rounded border border-aura-border bg-black/40 px-2 py-1 text-right" />
        </label>
        <label className="mt-1 flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={ripple} onChange={(e) => setRipple(e.target.checked)} /> Ripple (move what follows)
        </label>
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
          <button disabled={busy || !delta} onClick={() => onOp({ op: "trim", clip_id: clip.id, edge: "in", delta, ripple })} className="rounded border border-aura-border px-2 py-1 disabled:opacity-40">Trim start</button>
          <button disabled={busy || !delta} onClick={() => onOp({ op: "trim", clip_id: clip.id, edge: "out", delta, ripple })} className="rounded border border-aura-border px-2 py-1 disabled:opacity-40">Trim end</button>
          <button disabled={busy || !delta} onClick={() => onOp({ op: "slip", clip_id: clip.id, delta })} className="rounded border border-aura-border px-2 py-1 disabled:opacity-40">Slip</button>
          <button disabled={busy || !delta} onClick={() => onOp({ op: "slide", clip_id: clip.id, delta })} className="rounded border border-aura-border px-2 py-1 disabled:opacity-40">Slide</button>
        </div>
      </div>
      {clip.kind === "take" && (
        <div className="mt-3 border-t border-aura-border pt-3">
          <p className="text-xs font-medium">Color</p>
          {GRADE.map((g) => (
            <label key={g.k} className="mt-1 block text-[11px] text-white/60">
              <span className="flex justify-between">
                {g.label}
                <span className="font-mono">{grade[g.k].toFixed(2)}</span>
              </span>
              <input aria-label={g.label} type="range" min={g.min} max={g.max} step={0.05} value={grade[g.k]} onChange={(e) => setGrade({ ...grade, [g.k]: Number(e.target.value) })} className="w-full" />
            </label>
          ))}
          <div className="mt-1 flex gap-2">
            <button disabled={busy || !dirtyGrade} onClick={() => onOp({ op: "grade", clip_id: clip.id, grade })} className="flex-1 rounded bg-aura-gold px-2 py-1 text-xs font-medium text-black disabled:opacity-40">Apply grade</button>
            <button disabled={busy} onClick={() => setGrade({ exposure: 0, contrast: 0, saturation: 0, temperature: 0 })} className="rounded border border-aura-border px-2 py-1 text-xs">Reset</button>
          </div>
        </div>
      )}
      {clip.track === "V1" && (
        <div className="mt-3 space-y-1.5 border-t border-aura-border pt-3 text-xs" role="group" aria-label="Transition">
          <div className="text-white/50">Transition (inside the clip — nothing else moves)</div>
          <label className="flex items-center justify-between gap-2">Start
            <select aria-label="Transition in" value={trans.in} onChange={(e) => setTrans({ ...trans, in: e.target.value as ClipTransition["in"] })} className="rounded border border-aura-border bg-black px-1 py-0.5">
              <option value="cut">Cut</option><option value="dissolve">Dissolve from the shot before</option><option value="fade_from_black">Fade up from black</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">End
            <select aria-label="Transition out" value={trans.out} onChange={(e) => setTrans({ ...trans, out: e.target.value as ClipTransition["out"] })} className="rounded border border-aura-border bg-black px-1 py-0.5">
              <option value="cut">Cut</option><option value="fade_to_black">Fade to black</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">Length
            <span><input aria-label="Transition length in frames" type="number" min={2} max={96} value={trans.frames} onChange={(e) => setTrans({ ...trans, frames: Math.max(2, Math.min(96, Math.round(Number(e.target.value) || 12))) })} className="w-14 rounded border border-aura-border bg-black px-1 py-0.5 text-right" /> frames ({(trans.frames / fps).toFixed(2)} s)</span>
          </label>
          <button disabled={busy || !dirtyTrans} onClick={() => onOp({ op: "transition", clip_id: clip.id, transition: trans })} className="w-full rounded bg-aura-gold px-2 py-1 font-medium text-black disabled:opacity-40">Apply transition</button>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-1 border-t border-aura-border pt-3 text-xs">
        <button disabled={busy} onClick={() => onOp({ op: "lift", clip_id: clip.id })} className="rounded border border-aura-border px-2 py-1 disabled:opacity-40" title="Remove and leave a gap (Delete)">Lift</button>
        <button disabled={busy} onClick={() => onOp({ op: "extract", clip_id: clip.id })} className="rounded border border-red-500/40 px-2 py-1 text-red-300 disabled:opacity-40" title="Remove and close the gap on all tracks (Shift+Delete)">Extract</button>
      </div>
    </div>
  );
}
