"use client";
// The cast's relationship map (BUILD_PLAN §8 item 12). Lines join characters who share scenes in the approved script
// (thicker = more scenes); gold lines are relationships a person saved; dashed lines are what the dialogue states
// (built-in, free) — "Add" saves one through Casting. Click a name to open that character.
import { useState } from "react";
import type { SetRelationshipInput } from "@aurastage/contracts";
import type { RelationshipMap as Map_ } from "../types";

export function RelationshipMap({ map, busy, onSelect, onAdd, onAddAll }: {
  map: Map_; busy: boolean; onSelect: (id: string) => void; onAdd: (input: SetRelationshipInput) => void; onAddAll: (inputs: SetRelationshipInput[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const nodes = map.nodes.filter((n) => n.scenes > 0 || map.edges.some((e) => e.a === n.id || e.b === n.id));
  const suggestions = map.edges.filter((e) => e.suggestion);
  const W = 640, H = 420, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 60;
  const pos = new Map(nodes.map((n, i) => {
    const t = (2 * Math.PI * i) / Math.max(1, nodes.length) - Math.PI / 2;
    return [n.id, { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) }];
  }));
  const name = new Map(map.nodes.map((n) => [n.id, n.name]));
  const maxScenes = Math.max(1, ...nodes.map((n) => n.scenes));

  return (
    <section aria-label="Relationship map" className="rounded-xl border border-aura-border bg-aura-panel">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm">
        <span>
          <span className="font-medium">Relationship map</span>
          <span className="ml-2 text-white/50">
            {map.edges.filter((e) => e.relationship).length} saved · {suggestions.length} suggested from the dialogue (free)
          </span>
        </span>
        <span className="text-aura-gold">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-aura-border p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {nodes.length < 2 ? (
            <p className="text-sm text-white/50">The map needs at least two characters in the approved script.</p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Characters and how they are connected" className="w-full">
              {map.edges.map((e) => {
                const p = pos.get(e.a), q = pos.get(e.b);
                if (!p || !q) return null;
                const label = e.relationship ?? e.suggestion?.relationship ?? null;
                return (
                  <g key={`${e.a}-${e.b}`}>
                    <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                      stroke={e.relationship ? "#d4af37" : e.suggestion ? "#d4af37" : "rgba(255,255,255,0.25)"}
                      strokeOpacity={e.relationship ? 0.9 : e.suggestion ? 0.6 : 1}
                      strokeDasharray={e.suggestion && !e.relationship ? "6 4" : undefined}
                      strokeWidth={1 + Math.min(5, e.shared_scenes)} />
                    {label && (
                      <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 4} textAnchor="middle" fontSize="11" fill={e.relationship ? "#f5e6b8" : "rgba(245,230,184,0.7)"}>
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
              {nodes.map((n) => {
                const p = pos.get(n.id)!;
                const r = 10 + (14 * n.scenes) / maxScenes;
                return (
                  <g key={n.id} role="button" tabIndex={0} aria-label={`Open ${n.name}`} className="cursor-pointer"
                    onClick={() => onSelect(n.id)} onKeyDown={(ev) => { if (ev.key === "Enter") onSelect(n.id); }}>
                    <circle cx={p.x} cy={p.y} r={r} fill="#1a1508" stroke="#d4af37" strokeWidth={1.5} />
                    <text x={p.x} y={p.y + r + 14} textAnchor="middle" fontSize="12" fill="#fff">{n.name}</text>
                    <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fill="#d4af37">{n.scenes}</text>
                  </g>
                );
              })}
            </svg>
          )}
          <div className="space-y-3 text-sm">
            <p className="text-xs text-white/50">
              Lines join characters who share scenes (thicker = more scenes; the number is how many scenes each is in). Gold lines are saved
              relationships; dashed ones are what the dialogue says.
            </p>
            {suggestions.length === 0 ? (
              <p className="text-xs text-white/40">No relationships stated in the dialogue to suggest.</p>
            ) : (
              <>
              <button disabled={busy} onClick={() => onAddAll(suggestions.map((e) => ({ character_a: e.a, character_b: e.b, relationship: e.suggestion!.relationship, description: e.suggestion!.evidence.slice(0, 2000) })))}
                className="w-full rounded-md bg-aura-gold px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40">
                Add all {suggestions.length} suggested relationship{suggestions.length === 1 ? "" : "s"}
              </button>
              <ul className="space-y-2" aria-label="Suggested relationships">
                {suggestions.map((e) => (
                  <li key={`${e.a}-${e.b}`} className="rounded-md border border-aura-border bg-black/30 p-2">
                    <div>{name.get(e.a)} &amp; {name.get(e.b)} <span className="text-aura-gold">· {e.suggestion!.relationship}</span></div>
                    <p className="text-[11px] text-white/50">{e.suggestion!.evidence}</p>
                    <button disabled={busy} onClick={() => onAdd({ character_a: e.a, character_b: e.b, relationship: e.suggestion!.relationship, description: e.suggestion!.evidence.slice(0, 2000) })}
                      aria-label={`Add ${e.suggestion!.relationship}: ${name.get(e.a)} and ${name.get(e.b)}`}
                      className="mt-1 rounded border border-aura-gold/60 px-2 py-0.5 text-xs text-aura-gold disabled:opacity-40">
                      Add
                    </button>
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
