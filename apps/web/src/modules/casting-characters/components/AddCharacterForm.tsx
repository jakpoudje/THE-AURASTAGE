"use client";

// "+ Add Character" (UI_REFERENCE §4): for people the script doesn't name clearly
// yet. The name must be unique in the project (same rule as script-found characters).
import { useState } from "react";
import type { CharacterRole } from "@aurastage/contracts";

export function AddCharacterForm({ busy, onCreate }: { busy: boolean; onCreate: (name: string, role: CharacterRole) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<CharacterRole>("supporting");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md bg-aura-gold px-3 py-1 text-xs font-medium text-black">
        + Add Character
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const created = await onCreate(name.trim(), role);
        if (created) {
          setName("");
          setOpen(false);
        }
      }}
      className="mt-3 space-y-2 rounded-lg border border-aura-border bg-black/30 p-3"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        placeholder="Character name"
        className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-aura-gold"
      />
      <div className="flex gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as CharacterRole)}
          aria-label="New character role"
          className="flex-1 rounded-md border border-aura-border bg-black/40 px-2 py-1.5 text-sm capitalize"
        >
          {(["lead", "supporting", "minor", "extra"] as const).map((r) => (
            <option key={r} value={r} className="bg-aura-panel">
              {r}
            </option>
          ))}
        </select>
        <button disabled={busy || !name.trim()} className="rounded-md bg-aura-gold px-3 text-sm font-medium text-black disabled:opacity-40">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-white/50">
          Cancel
        </button>
      </div>
    </form>
  );
}
