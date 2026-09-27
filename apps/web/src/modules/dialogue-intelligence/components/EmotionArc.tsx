// Scene Insights: emotion arc (intensity per line, as annotated). Shows only what
// has been annotated — unannotated lines are gaps, never invented values.
import type { DialogueLine } from "@aurastage/contracts";

export function EmotionArc({ lines }: { lines: DialogueLine[] }) {
  const pts = lines.map((l, i) => ({ i, v: l.intensity, emotion: l.emotion }));
  const annotated = pts.filter((p) => p.v !== null);
  const W = 260, H = 90, pad = 8;
  const x = (i: number) => pad + (lines.length <= 1 ? (W - 2 * pad) / 2 : (i / (lines.length - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - (v / 10) * (H - 2 * pad);
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="text-xs uppercase tracking-widest text-aura-gold">Emotion arc</h3>
      {annotated.length === 0 ? (
        <p className="mt-2 text-sm text-white/40">Set an intensity on lines to see the scene's emotional shape.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Intensity across ${lines.length} lines; ${annotated.length} annotated`}>
            <line x1={pad} x2={W - pad} y1={y(5)} y2={y(5)} stroke="currentColor" className="text-white/10" strokeDasharray="3 3" />
            <polyline fill="none" stroke="#e8b84b" strokeWidth="2" points={annotated.map((p) => `${x(p.i)},${y(p.v!)}`).join(" ")} />
            {annotated.map((p) => (
              <circle key={p.i} cx={x(p.i)} cy={y(p.v!)} r="3.5" fill="#e8b84b">
                <title>{`Line ${p.i + 1}: ${p.v}/10${p.emotion ? ` · ${p.emotion}` : ""}`}</title>
              </circle>
            ))}
          </svg>
          <p className="text-[11px] text-white/40">
            {annotated.length} of {lines.length} lines annotated · 0 = calm, 10 = peak
          </p>
        </>
      )}
    </div>
  );
}
