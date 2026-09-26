"use client";

// SRS §6.1: uncertain candidates are surfaced for a person, never inserted silently.
import { useState } from "react";
import type { CharacterCandidate } from "@aurastage/engines";

export function PendingCandidates({
  pending,
  busy,
  onConfirm,
}: {
  pending: CharacterCandidate[];
  busy: boolean;
  onConfirm: (keys: string[]) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const shown = pending.filter((c) => !dismissed.has(c.key));
  if (shown.length === 0) return null;
  return (
    <div className="rounded-xl border border-aura-gold/30 bg-aura-panel p-4">
      <h3 className="text-xs uppercase tracking-widest text-aura-gold">Needs your confirmation ({shown.length})</h3>
      <p className="mt-1 text-xs text-white/50">These names appear in the script but we aren't sure they're characters.</p>
      <ul className="mt-3 space-y-2">
        {shown.map((c) => (
          <li key={c.key} className="rounded-lg border border-aura-border bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{c.display_name}</span>
              <span className="text-[11px] text-white/40">{Math.round(c.confidence * 100)}% sure</span>
            </div>
            <p className="mt-1 text-xs text-white/50">{c.reason}</p>
            {c.introduction && <p className="mt-1 line-clamp-2 text-xs italic text-white/40">“{c.introduction}”</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onConfirm([c.key])}
                disabled={busy}
                className="rounded-md border border-aura-gold/60 px-3 py-1 text-xs text-aura-gold disabled:opacity-50"
              >
                Add as character
              </button>
              <button
                onClick={() => setDismissed((s) => new Set(s).add(c.key))}
                className="rounded-md px-3 py-1 text-xs text-white/50 hover:text-white"
              >
                Not a character
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
