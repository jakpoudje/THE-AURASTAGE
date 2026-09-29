"use client";

// Set volume automation precisely (the lane is for drawing): the level at the playhead, a point at the playhead at a
// typed level, a dip under the selected clip, or clear. Each action is one save against the automation revision.
import { useState } from "react";
import type { AutomationPoint } from "@aurastage/contracts";
import { timelineAutomation } from "@aurastage/engines";
import { tc } from "../state/timelineMath";

export function AutomationPanel({ points, frame, fps, selection, busy, onChange }: {
  points: AutomationPoint[]; frame: number; fps: number; selection: { from: number; to: number; label: string } | null; busy: boolean;
  onChange: (next: AutomationPoint[], summary: string) => void;
}) {
  const here = timelineAutomation.automationDbAt(points, frame);
  const [db, setDb] = useState("-6");
  const [dipDb, setDipDb] = useState("-8");
  const value = Number(db), dipValue = Number(dipDb);
  const okDb = Number.isFinite(value) && value >= -60 && value <= 12;
  const okDip = Number.isFinite(dipValue) && dipValue >= -60 && dipValue < 0;
  const onPoint = points.find((p) => p.frame === frame);
  const input = "w-20 rounded border border-aura-border bg-black/30 px-2 py-1 text-right font-mono text-xs";
  return (
    <section className="space-y-3 rounded-xl border border-aura-border bg-aura-panel p-4" aria-label="Volume automation">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg">Volume automation</h3>
        <span className="text-[11px] text-white/40">{points.length} point{points.length === 1 ? "" : "s"}</span>
      </div>
      <p className="text-[11px] text-white/50">
        Shapes the whole cut's sound on top of each scene's approved mix (0 dB = as mixed). Draw it on the Volume lane with the Draw tool, or set it here. It is
        kept with every version, can change after Picture Lock, and the export uses exactly this curve.
      </p>
      <p className="text-sm" data-testid="automation-at-playhead">
        At {tc(frame, fps)}: <span className="font-mono text-aura-gold">{here > 0 ? "+" : ""}{here.toFixed(1)} dB</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          Level
          <input aria-label="Level at playhead (dB)" className={input} value={db} onChange={(e) => setDb(e.target.value)} inputMode="decimal" />
          dB
        </label>
        <button disabled={busy || !okDb} onClick={() => onChange(timelineAutomation.setPoint(points, frame, value), `Set ${value > 0 ? "+" : ""}${value.toFixed(1)} dB at ${tc(frame, fps)}`)}
          className="rounded border border-aura-gold/60 px-2 py-1 text-aura-gold disabled:opacity-40">
          Set at playhead
        </button>
        {onPoint && (
          <button disabled={busy} onClick={() => onChange(timelineAutomation.removePoint(points, frame), `Point at ${tc(frame, fps)} removed`)} className="rounded border border-aura-border px-2 py-1 disabled:opacity-40">
            Remove this point
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          Dip
          <input aria-label="Dip level (dB)" className={input} value={dipDb} onChange={(e) => setDipDb(e.target.value)} inputMode="decimal" />
          dB
        </label>
        <button
          disabled={busy || !selection || !okDip}
          title={selection ? `Lower the sound under “${selection.label}”, with half-second ramps` : "Select a clip first"}
          onClick={() => selection && onChange(timelineAutomation.dip(points, selection.from, selection.to, dipValue, Math.round(fps / 2)), `Dipped ${dipValue} dB under “${selection.label}”`)}
          className="rounded border border-aura-border px-2 py-1 disabled:opacity-40"
        >
          Dip under selected clip
        </button>
      </div>
      <button disabled={busy || !points.length} onClick={() => window.confirm("Clear all volume automation? The cut plays at its mixed level.") && onChange([], "Volume automation cleared")}
        className="text-xs text-white/50 underline disabled:opacity-40">
        Clear all
      </button>
    </section>
  );
}
