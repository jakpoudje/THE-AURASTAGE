// A schematic framing guide (not a generated image): how much of a person the
// shot size shows, how many people are in frame, and the camera angle.
// Real storyboard images arrive with Visual Generation (Phase 7).
import type { Shot } from "@aurastage/contracts";

// Head radius and head-centre height (as a share of frame height) per size.
const SCALE: Record<string, { r: number; y: number }> = {
  EWS: { r: 0.02, y: 0.66 }, WS: { r: 0.035, y: 0.55 }, FULL: { r: 0.06, y: 0.3 }, MWS: { r: 0.08, y: 0.33 },
  COWBOY: { r: 0.09, y: 0.33 }, MS: { r: 0.12, y: 0.36 }, MCU: { r: 0.17, y: 0.4 }, CU: { r: 0.27, y: 0.48 }, ECU: { r: 0.5, y: 0.52 },
  TWO_SHOT: { r: 0.1, y: 0.36 }, THREE_SHOT: { r: 0.08, y: 0.36 }, GROUP: { r: 0.06, y: 0.38 }, OTS: { r: 0.15, y: 0.4 },
  POV: { r: 0.08, y: 0.4 }, CUTAWAY: { r: 0.1, y: 0.4 },
};

function Person({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g fill="currentColor">
      <circle cx={cx} cy={cy} r={r} />
      <path d={`M ${cx - r * 2.2} ${cy + r * 5} Q ${cx - r * 2.1} ${cy + r * 1.3} ${cx} ${cy + r * 1.25} Q ${cx + r * 2.1} ${cy + r * 1.3} ${cx + r * 2.2} ${cy + r * 5} Z`} />
    </g>
  );
}

export function ShotFrame({ shot, className = "" }: { shot: Pick<Shot, "size" | "angle" | "character_ids" | "purpose">; className?: string }) {
  const W = 160, H = 90;
  const s = SCALE[shot.size];
  const n = shot.size === "TWO_SHOT" ? 2 : shot.size === "THREE_SHOT" ? 3 : shot.size === "GROUP" ? 4 : Math.max(1, Math.min(3, shot.character_ids.length || 1));
  const people = ["CU", "ECU", "MCU", "OTS", "POV", "CUTAWAY"].includes(shot.size) ? 1 : n;
  const tilt = shot.angle === "dutch" ? 12 : 0;
  const horizon = shot.angle === "high" || shot.angle === "overhead" || shot.angle === "birds_eye" ? 0.35 : shot.angle === "low" || shot.angle === "worms_eye" ? 0.8 : 0.62;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block w-full rounded-md bg-[#15151a] text-white/35 ${className}`} role="img" aria-label="Framing guide">
      <line x1="0" x2={W} y1={H * horizon} y2={H * horizon} stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
      {shot.size === "INSERT" ? (
        <rect x={W * 0.3} y={H * 0.25} width={W * 0.4} height={H * 0.5} rx="4" fill="currentColor" />
      ) : s ? (
        <g transform={`rotate(${tilt} ${W / 2} ${H / 2})`}>
          {Array.from({ length: people }, (_, i) => {
            const cx = shot.size === "OTS" ? W * 0.64 : W * ((i + 1) / (people + 1));
            return <Person key={i} cx={cx} cy={H * s.y} r={H * s.r} />;
          })}
          {shot.size === "OTS" && <ellipse cx={W * 0.12} cy={H * 0.75} rx={W * 0.2} ry={H * 0.45} fill="currentColor" opacity="0.7" />}
        </g>
      ) : null}
      {shot.size === "POV" && <rect x="2" y="2" width={W - 4} height={H - 4} rx="30" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.5" />}
    </svg>
  );
}
