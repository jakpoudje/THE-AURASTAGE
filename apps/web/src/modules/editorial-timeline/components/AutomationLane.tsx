"use client";

// Volume automation lane under A1 (migration 0032). The curve is drawn over the cut's sound:
//  - Draw tool: press and drag across the lane to paint the level (the stroke is thinned to the points that matter).
//  - Any other tool: click the lane to add a point, drag a point to move it, double-click a point to remove it.
// Nothing changes locally for long: each gesture becomes ONE save (against the automation revision), and the
// screen reloads from the API. Levels are relative to the approved scene mixes (0 dB = as mixed).
import { useRef, useState } from "react";
import type { AutomationPoint } from "@aurastage/contracts";
import { timelineAutomation } from "@aurastage/engines";
import { tc } from "../state/timelineMath";

export const LANE_HEIGHT = 72;
const PAD = 6;
/** Fader-style scale: most of the height for -12…+12 dB, the rest down to -60 dB. */
export function dbToY(db: number) {
  const pos = db >= -12 ? 0.3 + ((db + 12) / 24) * 0.7 : ((Math.max(-60, db) + 60) / 48) * 0.3;
  return PAD + (1 - pos) * (LANE_HEIGHT - 2 * PAD);
}
export function yToDb(y: number) {
  const pos = 1 - (y - PAD) / (LANE_HEIGHT - 2 * PAD);
  const db = pos >= 0.3 ? -12 + ((pos - 0.3) / 0.7) * 24 : -60 + (pos / 0.3) * 48;
  return Math.round(Math.max(-60, Math.min(12, db)) * 10) / 10;
}
const fmtDb = (db: number) => `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;

export function AutomationLane({
  points, fps, ppf, width, draw, busy, onChange,
}: {
  points: AutomationPoint[]; fps: number; ppf: number; width: number; draw: boolean; busy: boolean;
  onChange: (next: AutomationPoint[], summary: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [stroke, setStroke] = useState<AutomationPoint[] | null>(null);
  const [drag, setDrag] = useState<{ from: number; frame: number; db: number } | null>(null);
  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { frame: Math.max(0, Math.round((e.clientX - r.left) / ppf)), db: yToDb(e.clientY - r.top) };
  };
  const shown = drag
    ? timelineAutomation.movePoint(points, drag.from, drag.frame, drag.db)
    : stroke
      ? timelineAutomation.drawStroke(points, stroke)
      : points;
  // The curve across the whole lane (flat before the first and after the last point).
  const line = shown.length
    ? [`M0 ${dbToY(shown[0].db)}`, ...shown.map((p) => `L${p.frame * ppf} ${dbToY(p.db)}`), `L${width} ${dbToY(shown[shown.length - 1].db)}`].join(" ")
    : `M0 ${dbToY(0)} L${width} ${dbToY(0)}`;

  return (
    <svg
      ref={svg}
      width={width}
      height={LANE_HEIGHT}
      className={`block ${draw ? "cursor-crosshair" : "cursor-copy"} ${busy ? "pointer-events-none opacity-60" : ""}`}
      role="application"
      aria-label="Volume automation lane"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute("data-bg")) return;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        if (draw) setStroke([at(e)]);
      }}
      onPointerMove={(e) => stroke && setStroke([...stroke, at(e)])}
      onPointerUp={(e) => {
        if (stroke) {
          const s = [...stroke, at(e)];
          setStroke(null);
          if (s.length > 1) onChange(timelineAutomation.drawStroke(points, s), "Volume drawn");
          return;
        }
      }}
      onClick={(e) => {
        if (draw || !(e.target === e.currentTarget || (e.target as Element).hasAttribute("data-bg"))) return;
        const p = at(e);
        onChange(timelineAutomation.setPoint(points, p.frame, p.db), `Point added at ${tc(p.frame, fps)}, ${fmtDb(p.db)}`);
      }}
    >
      <rect data-bg x={0} y={0} width={width} height={LANE_HEIGHT} fill="transparent" />
      {[12, 0, -12, -30].map((db) => (
        <g key={db} pointerEvents="none">
          <line x1={0} x2={width} y1={dbToY(db)} y2={dbToY(db)} stroke={db === 0 ? "rgba(212,175,55,0.35)" : "rgba(255,255,255,0.06)"} strokeDasharray={db === 0 ? "4 4" : undefined} />
        </g>
      ))}
      <path d={line} fill="none" stroke="#d4af37" strokeWidth={1.5} pointerEvents="none" />
      <path d={`${line} L${width} ${LANE_HEIGHT} L0 ${LANE_HEIGHT} Z`} fill="rgba(212,175,55,0.08)" pointerEvents="none" />
      {shown.map((p) => (
        <circle
          key={p.frame}
          cx={p.frame * ppf}
          cy={dbToY(p.db)}
          r={4.5}
          fill="#0b0b0b"
          stroke="#d4af37"
          strokeWidth={1.5}
          role="button"
          aria-label={`Automation point ${tc(p.frame, fps)} ${fmtDb(p.db)}`}
          className={draw ? "pointer-events-none" : "cursor-grab"}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrag({ from: p.frame, frame: p.frame, db: p.db });
          }}
          onPointerMove={(e) => drag?.from === p.frame && setDrag({ ...drag, ...at(e) })}
          onPointerUp={(e) => {
            e.stopPropagation();
            const d = drag;
            setDrag(null);
            if (d && (d.frame !== d.from || d.db !== p.db)) onChange(timelineAutomation.movePoint(points, d.from, d.frame, d.db), `Point moved to ${tc(d.frame, fps)}, ${fmtDb(d.db)}`);
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onChange(timelineAutomation.removePoint(points, p.frame), `Point at ${tc(p.frame, fps)} removed`);
          }}
        >
          <title>{`${tc(p.frame, fps)} · ${fmtDb(p.db)}`}</title>
        </circle>
      ))}
      {drag && (
        <text x={drag.frame * ppf + 8} y={Math.max(12, dbToY(drag.db) - 6)} fontSize={10} fill="#d4af37" pointerEvents="none">
          {`${tc(drag.frame, fps)} · ${fmtDb(drag.db)}`}
        </text>
      )}
    </svg>
  );
}
