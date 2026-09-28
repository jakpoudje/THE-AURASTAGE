"use client";

// Delivery presets (versioned profiles from engines/rendering). Unavailable ones say why.
import { useState } from "react";
import type { DeliveryProfile } from "../types";

const FILTERS: { id: string; label: string; cats: string[] }[] = [
  { id: "all", label: "All", cats: [] },
  { id: "cinema", label: "Cinema", cats: ["cinema"] },
  { id: "broadcast", label: "Broadcast", cats: ["broadcast"] },
  { id: "streaming", label: "Streaming", cats: ["streaming"] },
  { id: "social", label: "Social", cats: ["social"] },
  { id: "archive", label: "Archive", cats: ["master", "audio", "editorial"] },
  { id: "review", label: "Review & text", cats: ["review", "subtitles"] },
];

export function Presets({ profiles, selected, onSelect, required = [] }: { profiles: DeliveryProfile[]; selected: string; onSelect: (id: string) => void; required?: string[] }) {
  const [filter, setFilter] = useState("all");
  const cats = FILTERS.find((f) => f.id === filter)!.cats;
  const list = profiles.filter((p) => !cats.length || cats.includes(p.category));
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-3">
      <h3 className="font-display text-lg">Export presets</h3>
      <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Preset filters">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${filter === f.id ? "border-aura-gold text-aura-gold" : "border-aura-border text-white/60"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 space-y-2" aria-label="Presets">
        {list.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onSelect(p.id)}
              aria-pressed={selected === p.id}
              className={`w-full rounded-lg border p-2.5 text-left ${selected === p.id ? "border-aura-gold bg-aura-gold/10" : "border-aura-border bg-black/30"} ${p.available ? "" : "opacity-60"}`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                <span>
                  {p.label}
                  {required.includes(p.id) && <span className="ml-2 rounded border border-aura-gold/50 px-1.5 text-[9px] uppercase text-aura-gold" title="Required in Project Settings">Required</span>}
                </span>
                {!p.available && <span className="rounded border border-white/20 px-1.5 text-[9px] uppercase text-white/50">not available</span>}
              </span>
              <span className="mt-0.5 block text-[11px] text-white/50">{p.available ? p.description : p.unavailable_reason}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
