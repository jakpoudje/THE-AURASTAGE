"use client";

// Auto-compiled prompt with evidence badges (location applied, wardrobe applied…) and the reference images a provider
// conditions on (characters in frame, the scene's location at its time of day, its props).
import { useReferenceImage } from "@/modules/casting-characters/components/LookPanel";
import { useEffect, useState } from "react";
import type { GenerationPackageContent } from "@aurastage/contracts";
import { visualApi } from "../api/visualApi";
import { promptCompiler } from "@aurastage/engines";
import type { VisualShot } from "../types";

function RefThumb({ assetId }: { assetId: string }) {
  const url = useReferenceImage(assetId);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-8 w-8 rounded bg-black object-cover" /> : <span className="h-8 w-8 rounded bg-white/5" />;
}

/** The shot's full prompt: from the list when it carries it, otherwise fetched for this package only (long films). */
function usePackageContent(pkg: VisualShot["package"]) {
  const [loaded, setLoaded] = useState<{ id: string; content: GenerationPackageContent } | null>(null);
  useEffect(() => {
    if (!pkg || pkg.content || loaded?.id === pkg.id) return;
    let live = true;
    visualApi.getPackage(pkg.id).then((r) => live && setLoaded({ id: pkg.id, content: r.content })).catch(() => undefined);
    return () => { live = false; };
  }, [pkg, loaded?.id]);
  if (!pkg) return null;
  const content = pkg.content ?? (loaded?.id === pkg.id ? loaded.content : null);
  return content ? { ...pkg, content } : null;
}

export function PromptPanel({ s, usable, busy, onCompile }: { s: VisualShot; usable: boolean; busy: boolean; onCompile: () => void }) {
  const pkg = usePackageContent(s.package);
  const loadingPrompt = !!s.package && !pkg;
  // 2.0 packages carry a separate moving-picture prompt (timing, dialogue for lip sync, how people move).
  const [mode, setMode] = useState<"image" | "video">("image");
  const videoPrompt = pkg?.content.video_prompt;
  // Owner 2026-10-02: the compact version that fits every provider (Runway's 1,000 characters is the shortest limit),
  // built from the same ranked blocks: camera, action, people and dialogue first; lower-ranked detail shortened or dropped.
  const [compact, setCompact] = useState(false);
  const blocks = pkg?.content.blocks;
  const fullText = mode === "video" && videoPrompt ? videoPrompt : pkg?.content.prompt;
  const small = compact && blocks?.length ? promptCompiler.composePrompt(blocks as promptCompiler.PromptBlock[], mode === "video" && videoPrompt ? "video" : "image", 1000) : null;
  const shown = small ? small.text : fullText;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <div className="flex items-center gap-3">
        <h3 className="flex-1 font-display text-lg">Auto-compiled prompt</h3>
        <button onClick={onCompile} disabled={!usable || busy} className="rounded-md border border-aura-gold/60 px-3 py-1 text-xs text-aura-gold disabled:opacity-40">
          {busy ? "Compiling…" : s.package ? "Recompile" : "Compile prompt"}
        </button>
      </div>
      {!usable && <p className="mt-2 text-xs text-aura-gold">The shot plan changed — approve it again in Storyboard before generating.</p>}
      {s.package?.review_state && s.package.review_state !== "current" && (
        <p className="mt-2 rounded border border-aura-gold/40 px-3 py-2 text-xs text-aura-gold">
          {s.package.review_reason} Recompile to use the latest approved version. Existing takes are kept.
        </p>
      )}
      {pkg ? (
        <>
          {videoPrompt && (
            <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Prompt for">
              {(["image", "video"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${mode === m ? "border-aura-gold text-aura-gold" : "border-aura-border text-white/50"}`}>
                  {m === "image" ? "Still image" : "Video"}
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 whitespace-pre-wrap rounded bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/80" aria-label={mode === "video" && videoPrompt ? "Compiled video prompt" : "Compiled prompt"}>
            {shown}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-white/35">
            <span>
              {small
                ? `Compact: ${small.chars.toLocaleString()} of 1,000 characters — fits every provider.${small.dropped.length ? ` Left out: ${small.dropped.join(", ")}.` : ""}${small.shortened.length ? ` Shortened: ${small.shortened.join(", ")}.` : ""}`
                : `Full prompt, ${(shown ?? "").length.toLocaleString()} characters. Providers with a shorter limit get a shortened version that keeps the camera, action, people and dialogue first.`}
            </span>
            {!!blocks?.length && (
              <label className="flex items-center gap-1 text-white/60">
                <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} aria-label="Show the 1,000-character version" /> Show the 1,000-character version
              </label>
            )}
          </div>
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
        <p className="mt-3 text-sm text-white/40">{loadingPrompt ? "Loading this shot's prompt…" : "Compile the prompt from the approved shot, its locked Scene DNA, the cast and the dialogue."}</p>
      )}
    </div>
  );
}
