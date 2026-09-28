"use client";

// apps/web/src/modules/assets-library/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Assets Library (docs/design/UI_REFERENCE.md §13, SRS §13.3). Backend: apps/api/src/modules/assets.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { can, useProjectAccess } from "@/lib/useProjectAccess";
import { useLibrary } from "./hooks/useLibrary";
import { AssetGrid } from "./components/AssetGrid";
import { AssetDetailPanel } from "./components/AssetDetailPanel";
import { CategoryTabs, FilterBar } from "./components/LibraryFilters";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/*,application/pdf,text/plain,text/csv,.cube";

export default function AssetsLibraryPage() {
  const { id } = useParams<{ id: string }>();
  const L = useLibrary(id);
  const access = useProjectAccess(id);
  const canCreate = can(access, "assets", "create");
  const canEdit = can(access, "assets", "edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [name, setName] = useState("");

  if (L.loading) return <div className="p-12 text-center text-white/50">Opening the Assets Library…</div>;
  if (!L.project || !L.lib) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{L.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">Back to dashboard</Link>
      </div>
    );
  }
  const lib = L.lib;
  const catLabel = (c: string) => lib.categories.find((x) => x.id === c)?.label ?? c;
  const chooseFile = (f: File | undefined) => {
    if (!f) return;
    setPending(f);
    setName(f.name.replace(/\.[^.]+$/, ""));
  };
  return (
    <AppShell project={L.project} active="assets"
      comments={L.detail ? { objectType: "Asset", objectId: L.detail.asset.id, objectLabel: L.detail.asset.name, objectVersion: `v${L.detail.asset.current_version}` } : undefined}
      actions={canCreate ? (
        <>
          <button onClick={() => fileRef.current?.click()} disabled={!lib.media_ready || L.busy} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">+ Upload</button>
          <input ref={fileRef} type="file" accept={ACCEPT} aria-label="File to upload" className="hidden" onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
        </>
      ) : undefined}>
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Assets Library</p>
        <h1 className="mt-2 font-display text-4xl">Your Production Assets. <span className="text-aura-gold">Organised. Searchable. Ready.</span></h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Every file is stored once, privately, with its versions and checksum. See where each asset is used, replace it without losing the old one, and link it to the scenes and characters it belongs to.
        </p>
        <p className="mt-2 text-xs text-white/40" data-testid="library-size">{lib.library_size} asset{lib.library_size === 1 ? "" : "s"}{lib.archived_count ? ` · ${lib.archived_count} archived` : ""}</p>
      </section>
      <div className="space-y-4 p-6">
        {!lib.media_ready && <p className="rounded-md border border-aura-gold/50 px-4 py-2 text-sm text-aura-gold">Media storage isn't set up on the server yet, so uploads are off.</p>}
        {!canEdit && <p className="rounded-md border border-aura-border px-4 py-2 text-sm text-white/60">You can browse and download assets. Adding or changing them needs Assets Library access from the project's producer.</p>}
        {L.error && <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{L.error} <button onClick={L.clearError} className="ml-2 underline">Dismiss</button></div>}
        {L.notice && <div role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{L.notice}</div>}
        {pending && (
          <div role="dialog" aria-label="Add asset" className="rounded-lg border border-aura-gold/50 bg-aura-panel p-4">
            <p className="text-sm">Add <span className="text-aura-gold">{pending.name}</span> ({(pending.size / 1024 / 1024).toFixed(1)} MB){L.filters.category ? ` to ${catLabel(L.filters.category)}` : ""}</p>
            <div className="mt-2 flex gap-2">
              <input aria-label="Asset name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md border border-aura-border bg-black px-3 py-1.5 text-sm" />
              <button disabled={!name.trim() || L.busy} onClick={async () => { await L.upload(pending, name.trim(), L.filters.category); setPending(null); }}
                className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">{L.busy ? "Uploading…" : "Add to library"}</button>
              <button onClick={() => setPending(null)} className="rounded-md border border-aura-border px-3 text-sm">Cancel</button>
            </div>
          </div>
        )}
        <CategoryTabs lib={lib} filters={L.filters} set={L.setFilters} />
        <FilterBar lib={lib} filters={L.filters} set={L.setFilters} />
        <p className="text-[11px] text-white/40">{lib.search_note}</p>
        <div className={`grid gap-4 ${L.detail ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
          <div>
            {lib.assets.length ? (
              <AssetGrid assets={lib.assets} selected={L.selected} onSelect={L.select} categoryLabel={catLabel} />
            ) : (
              <div className="rounded-lg border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
                {lib.library_size === 0 && !L.filters.archived ? "No assets yet. Upload reference images, recordings, documents or LUTs — audio recorded in Audio Studio shows up here too." : "Nothing matches these filters."}
              </div>
            )}
          </div>
          {L.detail && (
            <AssetDetailPanel key={L.detail.asset.id} d={L.detail} lib={lib} projectId={id} canEdit={canEdit} busy={L.busy}
              onUpdate={L.update} onReplace={L.replace} onLink={L.link} onClose={() => L.select(null)} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
