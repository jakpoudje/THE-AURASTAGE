"use client";

// Relationships for one character. Shared-scene counts come from the approved
// script's appearances (evidence), not from the label a person types.
import { useState } from "react";
import type { Character, CharacterAppearance, CharacterRelationship, SetRelationshipInput } from "@aurastage/contracts";

const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-aura-gold";

export function RelationshipsTab({
  character,
  characters,
  relationships,
  appearances,
  busy,
  onSave,
  onDelete,
}: {
  character: Character;
  characters: Character[];
  relationships: CharacterRelationship[];
  appearances: CharacterAppearance[];
  busy: boolean;
  onSave: (input: SetRelationshipInput) => void;
  onDelete: (id: string) => void;
}) {
  const [other, setOther] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const byId = new Map(characters.map((c) => [c.id, c]));
  const scenesOf = (id: string) => new Set(appearances.filter((a) => a.character_id === id).map((a) => a.scene_id));
  const mine = scenesOf(character.id);
  const shared = (id: string) => [...scenesOf(id)].filter((s) => mine.has(s)).length;

  const rels = relationships.filter((r) => r.character_a === character.id || r.character_b === character.id);
  const options = characters.filter((c) => c.id !== character.id && !c.merged_into);

  return (
    <div className="space-y-5">
      {rels.length === 0 ? (
        <p className="text-sm text-white/50">No relationships yet.</p>
      ) : (
        <ul className="space-y-2">
          {rels.map((r) => {
            const otherId = r.character_a === character.id ? r.character_b : r.character_a;
            const o = byId.get(otherId);
            const n = shared(otherId);
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-lg border border-aura-border bg-black/30 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-aura-gold/15 font-display text-aura-gold">
                  {(o?.name ?? "?").charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    {o?.name ?? "Unknown"} <span className="text-aura-gold">· {r.relationship}</span>
                  </div>
                  {r.description && <p className="text-xs text-white/60">{r.description}</p>}
                  <p className="text-[11px] text-white/40">
                    {n === 0 ? "Not in any scene together in the approved script" : `Together in ${n} ${n === 1 ? "scene" : "scenes"}`}
                  </p>
                </div>
                <button onClick={() => onDelete(r.id)} disabled={busy} className="text-xs text-white/40 hover:text-red-300">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!other || !label.trim()) return;
          onSave({ character_a: character.id, character_b: other, relationship: label.trim(), description: description.trim() || undefined });
          setOther("");
          setLabel("");
          setDescription("");
        }}
        className="space-y-2 rounded-lg border border-dashed border-aura-border p-3"
      >
        <h3 className="text-xs uppercase tracking-widest text-white/50">Add relationship</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <select value={other} onChange={(e) => setOther(e.target.value)} aria-label="Other character" className={input}>
            <option value="" className="bg-aura-panel">
              Choose a character…
            </option>
            {options.map((c) => (
              <option key={c.id} value={c.id} className="bg-aura-panel">
                {c.name}
              </option>
            ))}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Sister, Rival, Editor" aria-label="Relationship" className={input} />
        </div>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="Notes (optional)" aria-label="Relationship notes" className={input} />
        <button disabled={busy || !other || !label.trim()} className="rounded-md border border-aura-gold/60 px-3 py-1 text-sm text-aura-gold disabled:opacity-40">
          Save relationship
        </button>
      </form>
    </div>
  );
}
