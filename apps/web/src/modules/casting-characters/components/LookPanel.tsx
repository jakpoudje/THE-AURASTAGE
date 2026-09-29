"use client";

// Look & References (owner request 2026-09-28): reference views of the character from the Casting profile, wardrobe
// and project style — one identity description used word for word in every view. Made in the background by the
// built-in sketch generator (free) or a connected image provider; saved in the Assets Library under Characters.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { lookApi, type CharacterLookView, type LookView } from "../api/lookApi";

const ANGLES = [["front", "Front"], ["three_quarter", "¾ view"], ["profile", "Profile"], ["back", "Back"]] as const;
const SIZES = [["CU", "Close-up"], ["MCU", "Medium close-up"], ["MS", "Medium"], ["FULL", "Full length"]] as const;
const urlCache = new Map<string, string>();

export function useReferenceImage(assetId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(assetId ? urlCache.get(assetId) ?? null : null);
  useEffect(() => {
    if (!assetId) return setUrl(null);
    if (urlCache.has(assetId)) return setUrl(urlCache.get(assetId)!);
    let alive = true;
    lookApi.image(assetId).then((b) => {
      const head = new TextDecoder().decode(new Uint8Array(b).slice(0, 5));
      const u = URL.createObjectURL(new Blob([b], { type: head.startsWith("<svg") || head.startsWith("<?xml") ? "image/svg+xml" : "image/png" }));
      urlCache.set(assetId, u);
      if (alive) setUrl(u);
    }).catch(() => null);
    return () => { alive = false; };
  }, [assetId]);
  return url;
}

function Cell({ v, selected, onSelect }: { v: LookView; selected: boolean; onSelect: () => void }) {
  const url = useReferenceImage(v.image?.asset_id);
  const working = v.latest && (v.latest.status === "queued" || v.latest.status === "running");
  return (
    <button onClick={onSelect} aria-label={`${v.label}${v.image ? "" : " — not made yet"}`} data-testid={`look-${v.key}`}
      className={`relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-md border bg-black/40 text-[10px] ${selected ? "border-aura-gold" : "border-aura-border"} ${v.in_default_set ? "" : "opacity-80"}`}>
      {url ? <img src={url} alt={v.label} className="h-full w-full object-contain" /> : <span className="px-1 text-center text-white/35">{working ? "Making…" : v.latest?.status === "failed" ? "Failed" : "Not made yet"}</span>}
      {working && url && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-white/70">Updating…</span>}
      {v.image?.stale && <span className="absolute bottom-1 left-1 rounded bg-amber-500/80 px-1 font-medium text-black">Profile changed</span>}
      {v.latest?.status === "failed" && <span className="absolute right-1 top-1 rounded bg-red-500/80 px-1 text-black">!</span>}
    </button>
  );
}

export function LookPanel({ characterId, canEdit, onPortrait }: { characterId: string; canEdit: boolean; onPortrait?: (assetId: string | null) => void }) {
  const [lookId, setLookId] = useState<string | null>(null);
  const [ageStateId, setAgeStateId] = useState<string | null>(null);
  const [data, setData] = useState<CharacterLookView | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [sel, setSel] = useState<string>("front:CU");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const d = await lookApi.get(characterId, lookId, ageStateId);
    setData(d);
    // The portrait is the character as in the profile (no specific age).
    if (!ageStateId) onPortrait?.(d.views.find((v) => v.key === "front:CU")?.image?.asset_id ?? null);
    if (timer.current) clearTimeout(timer.current);
    // Views are made by the generation worker; check back while any is waiting.
    if (d.views.some((v) => v.latest && (v.latest.status === "queued" || v.latest.status === "running"))) timer.current = setTimeout(() => load().catch(() => null), 2000);
    return d;
  }, [characterId, lookId, ageStateId, onPortrait]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the look"));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  async function generate(views?: string[]) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await lookApi.generate(characterId, { look_id: lookId, age_state_id: ageStateId, views, ...(provider ? { provider } : {}) });
      setNotice(`Making ${r.requested.length} view${r.requested.length === 1 ? "" : "s"} with ${data?.backends.find((b) => b.id === r.provider)?.name ?? r.provider}. They appear here and in the Assets Library under Characters.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p role="alert" className="text-sm text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-white/50">Loading…</p>;
  const view = data.views.find((v) => v.key === sel) ?? data.views[0];
  const made = data.views.filter((v) => v.image).length;
  const stale = data.views.filter((v) => v.image?.stale).length;
  return (
    <section aria-label="Look and references" className="space-y-4">
      <div className="rounded-lg border border-aura-border bg-black/20 p-4 text-sm">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">Identity used in every view</div>
        <p data-testid="look-identity">{data.identity}</p>
        {data.wardrobe && <p className="mt-1 text-white/70">{data.wardrobe}</p>}
        {data.missing.length > 0 && (
          <p className="mt-2 text-xs text-amber-300">Add {data.missing.join(", ")} in the Profile tab so every view shows the same person more precisely.</p>
        )}
        {data.age_states.length === 0 && <p className="mt-2 text-[11px] text-white/40">Flashback or time jump? Add the character's other ages in the Ages tab, then make views for each age here.</p>}
        <p className="mt-2 text-[11px] text-white/40">Built from this character's profile, wardrobe look and the project look in Project Settings. When any of them changes, existing views are marked “Profile changed” — nothing is replaced automatically.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="text-white/60">Wardrobe
          <select aria-label="Wardrobe for these views" value={lookId ?? ""} onChange={(e) => setLookId(e.target.value || null)} className="mt-1 block rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
            <option value="">No specific outfit</option>
            {data.looks.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="text-white/60">Age
          <select aria-label="Age for these views" value={ageStateId ?? ""} onChange={(e) => setAgeStateId(e.target.value || null)} className="mt-1 block rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
            <option value="">As in the profile</option>
            {data.age_states.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.age})</option>)}
          </select>
        </label>
        <label className="text-white/60">Made by
          <select aria-label="Image generator" value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 block rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
            <option value="">AuraStage Sketch (built in, free)</option>
            {data.backends.filter((b) => b.execution !== "native").map((b) => <option key={b.id} value={b.id}>{b.name} (paid)</option>)}
            {data.backend_statuses.filter((b) => b.state !== "configured").map((b) => <option key={b.id} value={b.id} disabled>{b.name} — add a key to connect</option>)}
          </select>
        </label>
        <button onClick={() => generate()} disabled={!canEdit || busy} title={canEdit ? undefined : "Your role can't edit Casting"}
          className="rounded-md bg-aura-gold px-4 py-2 font-medium text-black disabled:opacity-40">{made ? "Regenerate look set (8 views)" : "Generate look set (8 views)"}</button>
        <button onClick={() => generate(data.views.map((v) => v.key))} disabled={!canEdit || busy} className="rounded-md border border-aura-border px-3 py-2 disabled:opacity-40">All 16 views</button>
        <span className="text-white/50" data-testid="look-summary">{made} of 16 made{stale ? ` · ${stale} need a refresh` : ""}</span>
      </div>
      {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

      <div role="grid" aria-label="Reference views" className="grid grid-cols-[76px_repeat(4,minmax(0,1fr))] gap-2 text-xs">
        <span />
        {ANGLES.map(([, l]) => <span key={l} className="text-center text-white/50">{l}</span>)}
        {SIZES.map(([s, sl]) => (
          <div key={s} role="row" className="contents">
            <span className="self-center text-white/50">{sl}</span>
            {ANGLES.map(([a]) => {
              const v = data.views.find((x) => x.key === `${a}:${s}`)!;
              return <Cell key={a} v={v} selected={v.key === sel} onSelect={() => setSel(v.key)} />;
            })}
          </div>
        ))}
      </div>
      <div aria-label="Selected view" className="grid gap-4 rounded-lg border border-aura-border p-3 text-xs sm:grid-cols-[minmax(0,220px)_1fr]">
        <SelectedImage v={view} />
        <div className="space-y-2">
          <div className="text-sm font-medium">{view.label}</div>
          {view.image && <p className="text-white/50">{view.image.execution === "native" ? "AuraStage Sketch — a labelled placeholder, not AI" : view.image.provider} · {view.versions} version{view.versions === 1 ? "" : "s"}{view.image.stale ? " · made before the latest profile change" : ""}</p>}
          {view.latest?.status === "failed" && <p className="text-red-300">{view.latest.error}</p>}
          <details><summary className="cursor-pointer text-white/60">Prompt sent to the generator</summary><p className="mt-1 whitespace-pre-wrap text-white/70" data-testid="look-prompt">{view.prompt}</p></details>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => generate([view.key])} disabled={!canEdit || busy} className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-aura-gold disabled:opacity-40">{view.image ? "Regenerate this view" : "Generate this view"}</button>
            {view.image && <a href={`/projects/${data.character.project_id}/assets?asset=${view.image.asset_id}`} className="self-center text-white/60 underline">Open in the Assets Library</a>}
          </div>
        </div>
      </div>
    </section>
  );
}

function SelectedImage({ v }: { v: LookView }) {
  const url = useReferenceImage(v.image?.asset_id);
  return url ? <img src={url} alt={`${v.label} reference`} className="max-h-72 w-full rounded bg-black object-contain" /> : <div className="flex aspect-[3/4] items-center justify-center rounded bg-black/40 text-white/35">Not made yet</div>;
}
