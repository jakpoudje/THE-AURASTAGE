// Character Extraction (SRS §5.2): speaking characters found in the script,
// with the evidence (line and scene counts). These are candidates only —
// Casting & Characters (Phase 3) is the canonical owner of Character identity.
import type { ScriptAnalysis } from "@aurastage/engines";

export function CharacterCandidates({ analysis }: { analysis: ScriptAnalysis }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="border-b border-aura-border px-5 py-3">
        <h2 className="font-display text-xl">Character Extraction</h2>
        <p className="text-sm text-white/50">
          Everyone who speaks in the script. Casting & Characters will turn these into full character profiles.
        </p>
      </div>
      {analysis.speaking_characters.length === 0 ? (
        <p className="p-5 text-sm text-white/40">No speaking characters found yet.</p>
      ) : (
        <ul className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {analysis.speaking_characters.map((c) => (
            <li key={c.name} className="flex items-center gap-3 rounded-lg border border-aura-border bg-black/30 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aura-gold/15 font-display text-aura-gold">
                {c.name.charAt(0)}
              </span>
              <div>
                <div className="text-sm">{c.name}</div>
                <div className="text-xs text-white/50">
                  {c.lines} {c.lines === 1 ? "line" : "lines"} · {c.scenes} {c.scenes === 1 ? "scene" : "scenes"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {analysis.locations.length > 0 && (
        <div className="border-t border-aura-border px-5 py-3">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-white/40">Locations</h3>
          <div className="flex flex-wrap gap-2">
            {analysis.locations.map((l) => (
              <span key={l.name} className="rounded-full border border-aura-border px-3 py-1 text-xs text-white/70">
                {l.name} · {l.scenes}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
