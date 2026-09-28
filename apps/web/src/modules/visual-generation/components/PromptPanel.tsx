// Auto-compiled prompt with evidence badges (location applied, wardrobe applied…).
import type { VisualShot } from "../types";

export function PromptPanel({ s, usable, busy, onCompile }: { s: VisualShot; usable: boolean; busy: boolean; onCompile: () => void }) {
  const pkg = s.package;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <div className="flex items-center gap-3">
        <h3 className="flex-1 font-display text-lg">Auto-compiled prompt</h3>
        <button onClick={onCompile} disabled={!usable || busy} className="rounded-md border border-aura-gold/60 px-3 py-1 text-xs text-aura-gold disabled:opacity-40">
          {busy ? "Compiling…" : pkg ? "Recompile" : "Compile prompt"}
        </button>
      </div>
      {!usable && <p className="mt-2 text-xs text-aura-gold">The shot plan changed — approve it again in Storyboard before generating.</p>}
      {pkg?.review_state && pkg.review_state !== "current" && (
        <p className="mt-2 rounded border border-aura-gold/40 px-3 py-2 text-xs text-aura-gold">
          {pkg.review_reason} Recompile to use the latest approved version. Existing takes are kept.
        </p>
      )}
      {pkg ? (
        <>
          <p className="mt-3 whitespace-pre-wrap rounded bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/80" aria-label="Compiled prompt">
            {pkg.content.prompt}
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Prompt checks">
            {pkg.content.checks.map((c) => (
              <li key={c.id} title={c.evidence} className={`rounded-full border px-2 py-0.5 text-[11px] ${c.ok ? "border-emerald-400/40 text-emerald-300" : "border-aura-gold/50 text-aura-gold"}`}>
                {c.ok ? "✓" : "!"} {c.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/35">Avoid: {pkg.content.negative.join("; ")}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-white/40">Compile the prompt from the approved shot, its locked Scene DNA, the cast and the dialogue.</p>
      )}
    </div>
  );
}
