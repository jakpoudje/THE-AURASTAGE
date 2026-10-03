"use client";

// One click for the whole cast (owner request 2026-09-30): the standard reference views for every character, as in
// their profile, made in the background like the per-character Look panel. Views already made from the current
// profile are kept unless "Remake" is ticked, so a second click only fills gaps and outdated views.

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { can, useProjectAccess } from "@/lib/useProjectAccess";
import { lookApi, type CharacterLookView } from "../api/lookApi";
import { CostNote } from "@/components/CostNote";

export function CastLooksBar({ projectId, firstCharacterId, count }: { projectId: string; firstCharacterId: string; count: number }) {
  const access = useProjectAccess(projectId);
  const canEdit = can(access, "casting", "edit");
  const [backends, setBackends] = useState<CharacterLookView["backends"]>([]);
  const [provider, setProvider] = useState("");
  const [redo, setRedo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // The connected image generators are the same for every character; read them once.
    lookApi.get(firstCharacterId, null).then((d) => setBackends(d.backends)).catch(() => null);
  }, [firstCharacterId]);

  async function run() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await lookApi.generateAll(projectId, { redo, ...(provider ? { provider } : {}) });
      const made = r.characters.filter((c) => c.requested > 0);
      // The built-in generator is named even if the generator list hasn't loaded yet (seen live: "with aurastage-sketch").
      const name = backends.find((b) => b.id === r.provider)?.name ?? (r.provider === "aurastage-sketch" ? "AuraStage Sketch" : r.provider);
      setNotice(r.requested
        ? `Making ${r.requested} view${r.requested === 1 ? "" : "s"} for ${made.length} character${made.length === 1 ? "" : "s"} (${made.map((c) => c.name).slice(0, 6).join(", ")}${made.length > 6 ? "…" : ""}) with ${name}. Open any character's Look tab to watch them arrive; they also go to the Assets Library under Characters.`
        + (r.paused ? ` ${r.paused}` : "")
        : r.paused ?? "Nothing new to make — every character's views are made, or being made, from their current profile. Tick “Remake ones already made” for fresh ones.");
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel px-4 py-3 text-sm" data-testid="cast-looks">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="font-medium">3 · Character looks for the whole cast</p>
          <p className="text-xs text-white/50">The standard reference views for all {count} character{count === 1 ? "" : "s"}, each drawn from their own profile.</p>
        </div>
        <select aria-label="Image generator for the whole cast" value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
          <option value="">AuraSketch (built in, free)</option>
          {backends.filter((b) => b.execution !== "native").map((b) => <option key={b.id} value={b.id}>{b.name} (paid)</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-white/70">
          <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} /> Remake ones already made
        </label>
        <button onClick={run} disabled={!canEdit || busy} title={canEdit ? undefined : "You need edit access to Casting"}
          className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">
          {busy ? "Starting…" : "Generate all character looks"}
        </button>
      </div>
      {(() => {
        const b = backends.find((x) => x.id === provider);
        return <CostNote label={`Estimated cost if every view is made (${count} × 8 views; views already made are skipped)`} items={[{ provider: b?.id ?? "aurastage-sketch", model: b?.model ?? null, count: count * 8 }]} />;
      })()}
      {(error || notice) && <p role={error ? "alert" : "status"} className={`mt-2 text-xs ${error ? "text-red-300" : "text-emerald-300"}`}>{error ?? notice}</p>}
    </div>
  );
}
