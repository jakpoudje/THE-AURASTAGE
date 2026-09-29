"use client";

// Ages (owner, 2026-09-29: flashbacks and time jumps): the character at other points in the story — "Flashback, 1995 —
// age 10: braided hair, no scar yet". Scene DNA chooses which age each scene uses; the Look tab makes reference views
// for each age. Changing or removing an age flags the Scene DNA that uses it for review.
import { useCallback, useEffect, useState } from "react";
import type { Character, CharacterAgeState } from "@aurastage/contracts";
import { castingApi } from "../api/castingApi";

const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-aura-gold";

export function AgesTab({ character, canEdit }: { character: Character; canEdit: boolean }) {
  const [ages, setAges] = useState<CharacterAgeState[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [age, setAge] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setAges((await castingApi.listAges(character.id)).age_states), [character.id]);
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the ages"));
  }, [load]);

  const startEdit = (a: CharacterAgeState | null) => {
    setEditing(a?.id ?? "new");
    setLabel(a?.label ?? "");
    setAge(a?.age ?? "");
    setDescription(a?.description ?? "");
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); return true; } catch (e) { setError(e instanceof Error ? e.message : "That didn't work"); return false; } finally { setBusy(false); }
  };

  if (!ages) return error ? <p role="alert" className="text-sm text-red-300">{error}</p> : <p className="text-sm text-white/50">Loading…</p>;
  return (
    <section aria-label="Ages" className="space-y-4">
      <p className="text-sm text-white/60">
        As in the profile: <span className="text-white">{character.age ? `aged ${character.age}` : "age not set"}</span>. Add the other ages the story shows
        {" "}— a flashback, a time jump, old age — then choose the age for each scene in Scene DNA and make reference views for it in Look &amp; References.
      </p>
      {ages.length === 0 && editing === null && <p className="text-sm text-white/40">No other ages yet.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {ages.map((a) => (
          <li key={a.id} className="rounded-lg border border-aura-border bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{a.label} <span className="text-white/50">· age {a.age}</span></span>
              {canEdit && (
                <span className="flex gap-3 text-xs">
                  <button onClick={() => startEdit(a)} className="text-aura-gold hover:underline">Edit</button>
                  <button onClick={() => run(() => castingApi.deleteAge(a.id))} disabled={busy} aria-label={`Remove ${a.label}`} className="text-white/40 hover:text-red-300">Remove</button>
                </span>
              )}
            </div>
            {a.description && <p className="mt-1 text-xs text-white/60">{a.description}</p>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {canEdit && (editing === null ? (
        <button onClick={() => startEdit(null)} className="rounded-md border border-aura-gold/60 px-3 py-1 text-sm text-aura-gold">+ Add age</button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim() || !age.trim()) return;
            const ok = await run(() => castingApi.saveAge(character.id, { id: editing === "new" ? undefined : editing, label: label.trim(), age: age.trim(), description: description.trim() || undefined }));
            if (ok) setEditing(null);
          }}
          className="space-y-2 rounded-lg border border-dashed border-aura-border p-3"
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="When, e.g. Flashback, 1995" aria-label="Age name" className={input} />
            <input value={age} onChange={(e) => setAge(e.target.value)} maxLength={40} placeholder="Age, e.g. 10" aria-label="Age" className={input} />
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000}
            placeholder="How they look then: hair, build, skin, scars, glasses…" aria-label="How they look at this age" className={input} />
          <div className="flex gap-2">
            <button disabled={busy || !label.trim() || !age.trim()} className="rounded-md bg-aura-gold px-3 py-1 text-sm font-medium text-black disabled:opacity-40">Save age</button>
            <button type="button" onClick={() => setEditing(null)} className="px-2 text-sm text-white/50">Cancel</button>
          </div>
        </form>
      ))}
    </section>
  );
}
