"use client";

import type { Filters, Library } from "../types";
import { TYPE_LABEL } from "./format";

export function CategoryTabs({ lib, filters, set }: { lib: Library; filters: Filters; set: (p: Partial<Filters>) => void }) {
  const all = Object.values(lib.category_counts).reduce((a, b) => a + b, 0);
  const tab = (id: string | null, label: string, n: number) => (
    <button key={id ?? "all"} role="tab" aria-selected={filters.category === id} onClick={() => set({ category: id })}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs ${filters.category === id ? "bg-aura-gold/15 text-aura-gold" : "text-white/60 hover:bg-white/5"}`}>
      {label} <span className="text-white/40">{n}</span>
    </button>
  );
  return (
    <div role="tablist" aria-label="Categories" className="flex gap-1 overflow-x-auto pb-1">
      {tab(null, "All", all)}
      {lib.categories.map((c) => tab(c.id, c.label, lib.category_counts[c.id] ?? 0))}
    </div>
  );
}

export function FilterBar({ lib, filters, set }: { lib: Library; filters: Filters; set: (p: Partial<Filters>) => void }) {
  const sel = "rounded-md border border-aura-border bg-black px-2 py-1.5 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="search" aria-label="Search assets" placeholder="Search names, descriptions, tags…" value={filters.q}
        onChange={(e) => set({ q: e.target.value })} className="min-w-[240px] flex-1 rounded-md border border-aura-border bg-black px-3 py-1.5 text-sm" />
      <select aria-label="Type" value={filters.type ?? ""} onChange={(e) => set({ type: e.target.value || null })} className={sel}>
        <option value="">All types</option>
        {Object.keys(TYPE_LABEL).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]} ({lib.type_counts[t] ?? 0})</option>)}
      </select>
      <select aria-label="Usage" value={filters.usage} onChange={(e) => set({ usage: e.target.value as Filters["usage"] })} className={sel}>
        <option value="any">Used or not</option>
        <option value="used">Used somewhere</option>
        <option value="unused">Not used yet</option>
      </select>
      <select aria-label="Scene" value={filters.scene_id ?? ""} onChange={(e) => set({ scene_id: e.target.value || null })} className={sel}>
        <option value="">Any scene</option>
        {lib.scenes.map((s) => <option key={s.id} value={s.id}>Scene {s.number} — {s.heading}</option>)}
      </select>
      <select aria-label="Sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} className={sel}>
        <option value="newest">Newest first</option>
        <option value="name">By name</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-white/60">
        <input type="checkbox" checked={filters.archived} onChange={(e) => set({ archived: e.target.checked })} /> Archived ({lib.archived_count})
      </label>
    </div>
  );
}
