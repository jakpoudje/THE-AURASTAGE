"use client";

// Shot details: every field of Shot DNA with categorised controls (SRS §9).
// Saves only the fields that changed; shows plain-language names for the codes.

import { useMemo, useState } from "react";
import type { Shot, ShotEditable, UpdateShotInput } from "@aurastage/contracts";
import { ANGLE, FOCUS, MOVEMENT, PURPOSE, SIZE, SUPPORT, TRANSITION } from "../state/labels";
import type { StoryboardScene } from "../types";

const input = "w-full rounded-md border border-aura-border bg-black/40 px-2.5 py-1.5 text-sm outline-none focus:border-aura-gold";
type Form = Omit<ShotEditable, "lens_mm"> & { lens_mm: number | null };
const pick = (s: Shot): Form => ({
  purpose: s.purpose, size: s.size, angle: s.angle, movement: s.movement, support: s.support, focus: s.focus, lens_mm: s.lens_mm,
  duration_seconds: s.duration_seconds, description: s.description, composition: s.composition, lighting: s.lighting,
  transition_in: s.transition_in, notes: s.notes, character_ids: s.character_ids, dialogue_line_ids: s.dialogue_line_ids,
  story_start: s.story_start, story_end: s.story_end,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-white/50">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={`${input} mt-1`}>
        {(Object.keys(options) as T[]).map((k) => (
          <option key={k} value={k}>
            {options[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
function Num({ label, value, onChange, step = 0.5, min = 0 }: { label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-white/50">{label}</span>
      <input
        aria-label={label}
        type="number"
        step={step}
        min={min}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`${input} mt-1`}
      />
    </label>
  );
}

export function ShotEditor({
  shot,
  scene,
  count,
  busy,
  onSave,
  onMove,
  onDelete,
}: {
  shot: Shot;
  scene: StoryboardScene;
  count: number;
  busy: boolean;
  onSave: (input: UpdateShotInput) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const base = useMemo(() => pick(shot), [shot]);
  const [f, setF] = useState<Form>(base);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const patch = Object.fromEntries((Object.keys(f) as (keyof Form)[]).filter((k) => !same(f[k], base[k])).map((k) => [k, f[k]])) as UpdateShotInput;
  const dirty = Object.keys(patch).length > 0;
  const toggle = (k: "character_ids" | "dialogue_line_ids", id: string) =>
    set(k, f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id]);

  return (
    <div className="space-y-4 p-4" aria-label="Shot details">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg">Shot {shot.ordinal}</h3>
        <span className="text-xs text-white/40">{SIZE[shot.size].label}</span>
        <span className="flex-1" />
        <button onClick={() => onMove(-1)} disabled={busy || shot.ordinal === 1} className="rounded border border-aura-border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move earlier">
          ↑ Earlier
        </button>
        <button onClick={() => onMove(1)} disabled={busy || shot.ordinal === count} className="rounded border border-aura-border px-2 py-1 text-xs disabled:opacity-30" aria-label="Move later">
          ↓ Later
        </button>
        <button
          onClick={() => window.confirm(`Remove shot ${shot.ordinal}? An approved plan keeps it in its history.`) && onDelete()}
          disabled={busy}
          className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300 disabled:opacity-30"
        >
          Remove
        </button>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wider text-white/50">What we see</span>
        <textarea aria-label="What we see" rows={2} maxLength={500} value={f.description} onChange={(e) => set("description", e.target.value)} className={`${input} mt-1`} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Purpose" value={f.purpose} options={PURPOSE} onChange={(v) => set("purpose", v)} />
        <Select label="Shot size" value={f.size} options={Object.fromEntries(Object.entries(SIZE).map(([k, v]) => [k, `${v.label} (${v.badge})`])) as Record<Form["size"], string>} onChange={(v) => set("size", v)} />
        <Select label="Angle" value={f.angle} options={ANGLE} onChange={(v) => set("angle", v)} />
        <Select label="Movement" value={f.movement} options={MOVEMENT} onChange={(v) => set("movement", v)} />
        <Select label="Camera support" value={f.support} options={SUPPORT as Record<Form["support"], string>} onChange={(v) => set("support", v)} />
        <Select label="Focus" value={f.focus} options={FOCUS as Record<Form["focus"], string>} onChange={(v) => set("focus", v)} />
        <Num label="Lens (mm)" value={f.lens_mm} step={1} min={8} onChange={(v) => set("lens_mm", v === null ? null : Math.round(v))} />
        <Num label="Duration (s)" value={f.duration_seconds} onChange={(v) => set("duration_seconds", v ?? 0)} />
        <Select label="Transition in" value={f.transition_in} options={TRANSITION as Record<Form["transition_in"], string>} onChange={(v) => set("transition_in", v)} />
        <Num label="Starts at (s)" value={f.story_start} onChange={(v) => set("story_start", v ?? 0)} />
        <Num label="Ends at (s)" value={f.story_end} onChange={(v) => set("story_end", v ?? 0)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-white/50">Composition</span>
          <input aria-label="Composition" maxLength={500} value={f.composition ?? ""} onChange={(e) => set("composition", e.target.value || null)} className={`${input} mt-1`} />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-white/50">Lighting</span>
          <input aria-label="Lighting" maxLength={500} value={f.lighting ?? ""} onChange={(e) => set("lighting", e.target.value || null)} className={`${input} mt-1`} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="text-[11px] uppercase tracking-wider text-white/50">In frame</legend>
          {scene.characters.length === 0 && <p className="mt-1 text-xs text-white/40">No characters in this scene.</p>}
          {scene.characters.map((c) => (
            <label key={c.id} className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.character_ids.includes(c.id)} onChange={() => toggle("character_ids", c.id)} />
              {c.name}
              {c.presence === "voice_only" && <span className="text-[10px] text-white/40">voice only</span>}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="text-[11px] uppercase tracking-wider text-white/50">Dialogue covered</legend>
          {scene.lines.length === 0 && <p className="mt-1 text-xs text-white/40">No dialogue in this scene.</p>}
          {scene.lines.map((l) => (
            <label key={l.id} className="mt-1 flex items-start gap-2 text-sm">
              <input className="mt-1" type="checkbox" checked={f.dialogue_line_ids.includes(l.id)} onChange={() => toggle("dialogue_line_ids", l.id)} />
              <span className="text-white/80">{l.label}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wider text-white/50">Notes</span>
        <textarea aria-label="Notes" rows={2} maxLength={2000} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} className={`${input} mt-1`} />
      </label>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-white/50">Unsaved changes</span>}
        <button onClick={() => setF(base)} disabled={!dirty || busy} className="rounded-md border border-aura-border px-3 py-1.5 text-sm disabled:opacity-40">
          Undo
        </button>
        <button onClick={() => onSave(patch)} disabled={!dirty || busy} className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">
          Save shot
        </button>
      </div>
    </div>
  );
}
