"use client";

// Auto-compiled prompt with evidence badges (location applied, wardrobe applied…) and the reference images a provider
// conditions on (characters in frame, the scene's location at its time of day, its props).
import { useReferenceImage } from "@/modules/casting-characters/components/LookPanel";
import type { VisualShot } from "../types";

function RefThumb({ assetId }: { assetId: string }) {
  const url = useReferenceImage(assetId);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-8 w-8 rounded bg-black object-cover" /> : <span className="h-8 w-8 rounded bg-white/5" />;
}

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
          {(pkg.content.references?.length ?? 0) > 0 && (
            <div className="mt-3" aria-label="Reference images">
              <p className="text-[11px] uppercase tracking-wider text-white/40">References for consistency</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {pkg.content.references!.map((r) => (
                  <li key={`${r.kind}:${r.object_id}`} className="flex items-center gap-2 rounded border border-aura-border bg-black/30 p-1 pr-2 text-[11px]">
                    <RefThumb assetId={r.asset_id} />
                    <span>{r.name}<span className="block text-white/40">{r.kind} · {r.view}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-[11px] text-white/35">Avoid: {pkg.content.negative.join("; ")}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-white/40">Compile the prompt from the approved shot, its locked Scene DNA, the cast and the dialogue.</p>
      )}
    </div>
  );
}
