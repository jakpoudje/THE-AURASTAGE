"use client";

// Key Wardrobe (UI_REFERENCE §4): named looks for a character (SRS §3 WardrobeLook).
// Images arrive with Visual Generation; for now each look is a name + description.
import { useState } from "react";
import type { Character, SaveWardrobeLookInput, WardrobeLook } from "@aurastage/contracts";

const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-aura-gold";

export function WardrobeTab({
  character,
  looks,
  busy,
  onSave,
  onDelete,
}: {
  character: Character;
  looks: WardrobeLook[];
  busy: boolean;
  onSave: (input: SaveWardrobeLookInput) => void;
  onDelete: (id: string) => void;
}) {
  const mine = looks.filter((l) => l.character_id === character.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const startEdit = (l: WardrobeLook | null) => {
    setEditing(l?.id ?? "new");
    setName(l?.name ?? "");
    setDescription(l?.description ?? "");
  };

  return (
    <div className="space-y-4">
      {mine.length === 0 && editing === null && <p className="text-sm text-white/50">No wardrobe looks yet.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {mine.map((l) => (
          <li key={l.id} className="rounded-lg border border-aura-border bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{l.name}</span>
              <span className="flex gap-3 text-xs">
                <button onClick={() => startEdit(l)} className="text-aura-gold hover:underline">
                  Edit
                </button>
                <button onClick={() => onDelete(l.id)} disabled={busy} className="text-white/40 hover:text-red-300">
                  Remove
                </button>
              </span>
            </div>
            {l.description && <p className="mt-1 text-xs text-white/60">{l.description}</p>}
          </li>
        ))}
      </ul>
      {editing === null ? (
        <button onClick={() => startEdit(null)} className="rounded-md border border-aura-gold/60 px-3 py-1 text-sm text-aura-gold">
          + Add look
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave({ id: editing === "new" ? undefined : editing, name: name.trim(), description: description.trim() || undefined });
            setEditing(null);
          }}
          className="space-y-2 rounded-lg border border-dashed border-aura-border p-3"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Look name, e.g. Field outfit" aria-label="Look name" className={input} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What they wear: garments, colours, condition, accessories"
            aria-label="Look description"
            className={input}
          />
          <div className="flex gap-2">
            <button disabled={busy || !name.trim()} className="rounded-md bg-aura-gold px-3 py-1 text-sm font-medium text-black disabled:opacity-40">
              Save look
            </button>
            <button type="button" onClick={() => setEditing(null)} className="px-2 text-sm text-white/50">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
