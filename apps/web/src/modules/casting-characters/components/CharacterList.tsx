"use client";

// Characters (N) list — UI_REFERENCE §4 left column.
import { useMemo, useState } from "react";
import type { Character, CharacterAppearance, CharacterRole } from "@aurastage/contracts";
import { RolePill } from "./RolePill";

const FILTERS: ("all" | CharacterRole)[] = ["all", "lead", "supporting", "minor", "extra"];

export function CharacterList({
  characters,
  appearances,
  selectedId,
  onSelect,
}: {
  characters: Character[];
  appearances: CharacterAppearance[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const sceneCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appearances) m.set(a.character_id, (m.get(a.character_id) ?? 0) + 1);
    return m;
  }, [appearances]);
  const shown = characters.filter(
    (c) => (filter === "all" || c.role === filter) && c.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="border-b border-aura-border p-4">
        <h2 className="font-display text-lg">Characters ({characters.length})</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search characters"
          className="mt-3 w-full rounded-md border border-aura-border bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-aura-gold"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] capitalize ${filter === f ? "bg-aura-gold/15 text-aura-gold" : "text-white/50"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto p-2">
        {shown.length === 0 && <li className="p-3 text-sm text-white/40">No characters match.</li>}
        {shown.map((c) => {
          const n = sceneCount.get(c.id) ?? 0;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  selectedId === c.id ? "bg-aura-gold/10" : "hover:bg-white/5"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-aura-gold/15 font-display text-aura-gold">
                  {c.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.name}</span>
                  <span className="text-[11px] text-white/40">
                    {n === 0 ? "Not in approved script" : `${n} ${n === 1 ? "scene" : "scenes"}`}
                    {c.status === "approved" && " · Approved"}
                  </span>
                </span>
                <RolePill role={c.role} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
