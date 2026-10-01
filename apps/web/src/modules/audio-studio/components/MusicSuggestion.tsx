"use client";
// The scene's suggested music (musicSuggestionEngine, built-in library — free). Spotting puts it on the Score track;
// "Generate" plays exactly this style with the built-in generator.
import type { MusicSuggestion } from "../types";

export function MusicSuggestionPanel({ m, spotted, onAddAmbient, busy = false }: { m: MusicSuggestion; spotted: boolean; onAddAmbient?: () => void; busy?: boolean }) {
  return (
    <section aria-label="Suggested music" className="rounded-xl border border-aura-border bg-aura-panel p-4 text-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Suggested music · free</h3>
      {m.needed ? (
        <>
          <p className="font-medium text-white">{m.style.name}</p>
          <p className="text-white/70">{m.key} · {m.tempo_bpm} BPM · about {m.level_db} dB</p>
          <p className="mt-1 text-white/70">{m.placement}</p>
          <p className="mt-1 text-white/50">For a composer or music provider: {m.instruments.join(", ")}</p>
        </>
      ) : (
        <p className="text-white/80">{m.placement}</p>
      )}
      <ul className="mt-2 list-disc pl-4 text-xs text-white/50">
        {m.why.map((w) => <li key={w}>{w}</li>)}
      </ul>
      {m.ambient && (
        <div className="mt-3 rounded-lg border border-aura-border/70 p-2" data-testid="ambient-bed">
          <p className="text-white/80">Ambient bed · free</p>
          <p className="text-xs text-white/60">{m.ambient.description} · about {m.ambient.level_db} dB</p>
          <p className="text-xs text-white/40">{m.ambient.why}</p>
          {onAddAmbient && (
            <button onClick={onAddAmbient} disabled={busy || !spotted} title={spotted ? undefined : "Spot the scene first"}
              className="mt-2 rounded-md border border-aura-gold/60 px-3 py-1 text-xs text-aura-gold disabled:opacity-40">Add an ambient bed (free)</button>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-white/40">
        {spotted ? "Re-spot the scene to put it on the Score track; “Generate all planned sounds” plays it with the built-in generator." : "Spotting puts it on the Score track."}
      </p>
    </section>
  );
}
