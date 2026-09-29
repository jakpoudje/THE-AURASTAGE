"use client";

// Reference views for a location (establishing / wide / medium / detail at every time of day the script uses) or a prop
// (hero / ¾ / detail / overhead / in hand). One identity description is used word for word in every view. Made in the
// background by the built-in sketch generator (free) or a connected image provider; saved in the Assets Library.

import { useCallback, useEffect, useRef, useState } from "react";
import { useReferenceImage } from "@/modules/casting-characters/components/LookPanel";
import { worldApi, type WorldKind, type WorldLook, type WorldView } from "../api/worldApi";

const LOC_VIEWS = [["establishing", "Establishing"], ["wide", "Wide"], ["medium", "Medium"], ["detail", "Detail"]] as const;

function Cell({ v, selected, onSelect }: { v: WorldView; selected: boolean; onSelect: () => void }) {
  const url = useReferenceImage(v.image?.asset_id);
  const working = v.latest && (v.latest.status === "queued" || v.latest.status === "running");
  return (
    <button onClick={onSelect} aria-label={`${v.label}${v.image ? "" : " — not made yet"}`} data-testid={`view-${v.key}`}
      className={`relative flex ${v.aspect_ratio === "16:9" ? "aspect-video" : "aspect-square"} items-center justify-center overflow-hidden rounded-md border bg-black/40 text-[10px] ${selected ? "border-aura-gold" : "border-aura-border"} ${v.in_default_set ? "" : "opacity-80"}`}>
      {url ? <img src={url} alt={v.label} className="h-full w-full object-cover" /> : <span className="px-1 text-center text-white/35">{working ? "Making…" : v.latest?.status === "failed" ? "Failed" : "Not made yet"}</span>}
      {working && url && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-white/70">Updating…</span>}
      {v.image?.stale && <span className="absolute bottom-1 left-1 rounded bg-amber-500/80 px-1 font-medium text-black">Description changed</span>}
    </button>
  );
}

export function WorldLookPanel({ kind, id, canEdit, onMade }: { kind: WorldKind; id: string; canEdit: boolean; onMade?: () => void }) {
  const [data, setData] = useState<WorldLook | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasWorking = useRef(false);

  const load = useCallback(async () => {
    const d = await worldApi.look(kind, id);
    setData(d);
    if (timer.current) clearTimeout(timer.current);
    const working = d.views.some((v) => v.latest && (v.latest.status === "queued" || v.latest.status === "running"));
    if (working) timer.current = setTimeout(() => load().catch(() => null), 2000);
    else if (wasWorking.current) onMade?.();
    wasWorking.current = working;
    return d;
  }, [kind, id, onMade]);

  useEffect(() => {
    setData(null); setSel(null); setNotice(null); setError(null);
    load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the views"));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  async function generate(views?: string[]) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await worldApi.generate(kind, id, { views, ...(provider ? { provider } : {}) });
      setNotice(`Making ${r.requested.length} view${r.requested.length === 1 ? "" : "s"} with ${data?.backends.find((b) => b.id === r.provider)?.name ?? r.provider}. They appear here and in the Assets Library under ${kind === "location" ? "Locations" : "Props"}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p role="alert" className="text-sm text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-white/50">Loading views…</p>;
  const view = data.views.find((v) => v.key === sel) ?? data.views[0];
  const made = data.views.filter((v) => v.image).length;
  const stale = data.views.filter((v) => v.image?.stale).length;
  const recommended = data.views.filter((v) => v.in_default_set).length;
  const times = [...new Set(data.views.map((v) => v.time).filter(Boolean))] as string[];

  return (
    <section aria-label="Reference views" className="space-y-3">
      <div className="rounded-lg border border-aura-border bg-black/20 p-3 text-sm">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">Identity used in every view</div>
        <p data-testid="world-identity">{data.identity}</p>
        {data.missing.length > 0 && <p className="mt-1 text-xs text-amber-300">Add a description above so every view shows the same {kind === "location" ? "place" : "object"} more precisely.</p>}
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="text-white/60">Made by
          <select aria-label="Image generator" value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 block rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
            <option value="">AuraStage Sketch (built in, free)</option>
            {data.backends.filter((b) => b.execution !== "native").map((b) => <option key={b.id} value={b.id}>{b.name} (paid)</option>)}
            {data.backend_statuses.filter((b) => b.state !== "configured").map((b) => <option key={b.id} value={b.id} disabled>{b.name} — add a key to connect</option>)}
          </select>
        </label>
        <button onClick={() => generate()} disabled={!canEdit || busy} title={canEdit ? undefined : "Your role can't edit Scene DNA"}
          className="rounded-md bg-aura-gold px-4 py-2 font-medium text-black disabled:opacity-40">{made ? `Regenerate reference set (${recommended} views)` : `Generate reference set (${recommended} views)`}</button>
        <button onClick={() => generate(data.views.map((v) => v.key))} disabled={!canEdit || busy} className="rounded-md border border-aura-border px-3 py-2 disabled:opacity-40">All {data.views.length} views</button>
        <span className="text-white/50" data-testid="world-summary">{made} of {data.views.length} made{stale ? ` · ${stale} need a refresh` : ""}</span>
      </div>
      {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

      {kind === "location" ? (
        <div role="grid" aria-label="Views by time of day" className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] gap-2 text-xs">
          <span />
          {LOC_VIEWS.map(([, l]) => <span key={l} className="text-center text-white/50">{l}</span>)}
          {times.map((t) => (
            <div key={t} role="row" className="contents">
              <span className="self-center capitalize text-white/50">{t.toLowerCase()}</span>
              {LOC_VIEWS.map(([vk]) => {
                const v = data.views.find((x) => x.key === `${vk}:${t}`)!;
                return <Cell key={vk} v={v} selected={v.key === view.key} onSelect={() => setSel(v.key)} />;
              })}
            </div>
          ))}
        </div>
      ) : (
        <div role="grid" aria-label="Views" className="grid grid-cols-5 gap-2 text-xs">
          {data.views.map((v) => (
            <div key={v.key} className="space-y-1"><Cell v={v} selected={v.key === view.key} onSelect={() => setSel(v.key)} /><div className="text-center text-white/50">{v.label}</div></div>
          ))}
        </div>
      )}

      <div aria-label="Selected view" className="grid gap-4 rounded-lg border border-aura-border p-3 text-xs sm:grid-cols-[minmax(0,260px)_1fr]">
        <Selected v={view} />
        <div className="space-y-2">
          <div className="text-sm font-medium">{view.label}</div>
          {view.image && <p className="text-white/50">{view.image.execution === "native" ? "AuraStage Sketch — a labelled placeholder, not AI" : view.image.provider} · {view.versions} version{view.versions === 1 ? "" : "s"}{view.image.stale ? " · made before the latest description change" : ""}</p>}
          {view.latest?.status === "failed" && <p className="text-red-300">{view.latest.error}</p>}
          <details><summary className="cursor-pointer text-white/60">Prompt sent to the generator</summary><p className="mt-1 whitespace-pre-wrap text-white/70" data-testid="world-prompt">{view.prompt}</p></details>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => generate([view.key])} disabled={!canEdit || busy} className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-aura-gold disabled:opacity-40">{view.image ? "Regenerate this view" : "Generate this view"}</button>
            {view.image && <a href={`/projects/${data.item.project_id}/assets?asset=${view.image.asset_id}`} className="self-center text-white/60 underline">Open in the Assets Library</a>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Selected({ v }: { v: WorldView }) {
  const url = useReferenceImage(v.image?.asset_id);
  return url ? <img src={url} alt={`${v.label} reference`} className="w-full rounded bg-black object-contain" /> : <div className={`flex ${v.aspect_ratio === "16:9" ? "aspect-video" : "aspect-square"} items-center justify-center rounded bg-black/40 text-white/35`}>Not made yet</div>;
}
