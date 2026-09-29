"use client";

// Centre panel: what a person decides about the scene (purpose, mood, look,
// sound, wardrobe…) next to what the engine found in the script, with the
// source line for every detection. Nothing detected is applied without a click.

import { useEffect, useMemo, useState } from "react";
import type { CameraEnergy, SceneDnaEditable, UpdateSceneDnaInput } from "@aurastage/contracts";
import type { SceneDnaEntry } from "../types";
import { clearSceneDraft, readSceneDraft, writeSceneDraft } from "../state/sceneDraft";

const TABS = ["Scene Overview", "Visual & Sound", "Performance", "Continuity", "Notes"] as const;
type Tab = (typeof TABS)[number];
const ENERGY: { value: CameraEnergy; label: string }[] = [
  { value: "calm", label: "Calm" },
  { value: "measured", label: "Measured" },
  { value: "dynamic", label: "Dynamic" },
  { value: "frenetic", label: "Frenetic" },
];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changes(base: SceneDnaEditable, form: SceneDnaEditable): UpdateSceneDnaInput {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(form) as (keyof SceneDnaEditable)[]) if (!same(base[k], form[k])) out[k] = form[k];
  return out as UpdateSceneDnaInput;
}

const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-white/50">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-white/35">{hint}</span>}
    </label>
  );
}

function Suggest({ items, onUse }: { items: { value: string; line?: number; text?: string }[]; onUse: (v: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <span className="text-[11px] text-white/35">Found in the script:</span>
      {items.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onUse(s.value)}
          title={s.text ? `Line ${s.line}: ${s.text}` : undefined}
          className="rounded-full border border-aura-gold/40 px-2 py-0.5 text-[11px] text-aura-gold hover:bg-aura-gold/10"
        >
          + {s.value}
          {s.line ? <span className="text-white/35"> · line {s.line}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SceneEditor({
  entry,
  busy,
  onSave,
  onDirtyChange,
}: {
  entry: SceneDnaEntry;
  busy: boolean;
  onSave: (input: UpdateSceneDnaInput) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const base = entry.editable;
  const sceneId = entry.scene.id;
  const [tab, setTab] = useState<Tab>("Scene Overview");
  const [form, setForm] = useState<SceneDnaEditable>(() => {
    const d = typeof window === "undefined" ? null : readSceneDraft(sceneId);
    return d ? { ...base, ...d } : base;
  });
  const [restored] = useState(() => typeof window !== "undefined" && !!readSceneDraft(sceneId) && !same(readSceneDraft(sceneId), base));
  const [moodText, setMoodText] = useState("");
  const patch = useMemo(() => changes(base, form), [base, form]);
  const dirty = Object.keys(patch).length > 0;

  useEffect(() => {
    onDirtyChange(dirty);
    if (dirty) writeSceneDraft(sceneId, form);
    else clearSceneDraft(sceneId);
  }, [dirty, form, sceneId, onDirtyChange]);

  const set = <K extends keyof SceneDnaEditable>(k: K, v: SceneDnaEditable[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: "purpose" | "stakes" | "story_time" | "weather" | "atmosphere" | "lighting_intent" | "sound_intent" | "notes") => ({
    value: form[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value === "" ? null : e.target.value),
  });
  const addMood = (m: string) => {
    const v = m.trim().toLowerCase();
    if (!v || form.mood.includes(v) || form.mood.length >= 8) return;
    set("mood", [...form.mood, v]);
  };
  const appendTo = (k: "weather" | "atmosphere" | "sound_intent", v: string) => {
    const cur = form[k]?.trim();
    if (cur && cur.toLowerCase().includes(v.toLowerCase())) return;
    set(k, cur ? `${cur}, ${v}` : v);
  };

  const p = entry.proposal;
  const moodSuggestions = [...p.dialogue.emotions.map((e) => e.emotion), ...p.environment.atmosphere.map((a) => a.value)]
    .filter((m, i, all) => all.indexOf(m) === i && !form.mood.includes(m))
    .map((value) => ({ value }));

  async function save() {
    if (await onSave(patch)) clearSceneDraft(sceneId);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-aura-border px-4 pt-3" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-2 text-sm ${tab === t ? "border-b-2 border-aura-gold text-aura-gold" : "text-white/50 hover:text-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {restored && dirty && (
        <p className="mx-4 mt-3 rounded-md border border-sky-400/30 px-3 py-2 text-xs text-sky-200">
          We kept your unsaved changes from last time. Save them, or{" "}
          <button className="underline" onClick={() => setForm(base)}>
            discard
          </button>
          .
        </p>
      )}

      <div className="space-y-4 p-4">
        {tab === "Scene Overview" && (
          <>
            <Field label="Purpose" hint="What must this scene achieve for the story?">
              <textarea rows={3} className={input} {...text("purpose")} />
            </Field>
            <Field label="Stakes" hint="What could be lost or won here?">
              <textarea rows={2} className={input} {...text("stakes")} />
            </Field>
            <Field label="Story time" hint="When in the story this happens (e.g. “Day 3, just after the vote”).">
              <input className={input} {...text("story_time")} />
            </Field>
            <div>
              <span className="text-xs uppercase tracking-wider text-white/50">Mood</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {form.mood.map((m) => (
                  <span key={m} className="flex items-center gap-1 rounded-full bg-aura-gold/15 px-2.5 py-0.5 text-xs text-aura-gold">
                    {m}
                    <button aria-label={`Remove ${m}`} onClick={() => set("mood", form.mood.filter((x) => x !== m))} className="text-aura-gold/60 hover:text-aura-gold">
                      ×
                    </button>
                  </span>
                ))}
                <input
                  aria-label="Add a mood"
                  placeholder={form.mood.length >= 8 ? "Up to 8 moods" : "Add a mood…"}
                  disabled={form.mood.length >= 8}
                  value={moodText}
                  onChange={(e) => setMoodText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addMood(moodText);
                      setMoodText("");
                    }
                  }}
                  className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                />
              </div>
              <Suggest items={moodSuggestions} onUse={addMood} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact label="Location" value={`${p.location.int_ext === "UNKNOWN" ? "" : p.location.int_ext + ". "}${p.location.name}`} />
              <Fact label="Time of day" value={p.location.time_of_day ?? "Not in the heading"} />
              <Fact label="Estimated length" value={`${Math.round(p.narrative.intended_duration_seconds)} s`} />
            </div>
          </>
        )}

        {tab === "Visual & Sound" && (
          <>
            <Field label="Weather">
              <input className={input} {...text("weather")} />
            </Field>
            <Suggest items={p.environment.weather} onUse={(v) => appendTo("weather", v)} />
            <Field label="Atmosphere">
              <input className={input} {...text("atmosphere")} />
            </Field>
            <Suggest items={p.environment.atmosphere} onUse={(v) => appendTo("atmosphere", v)} />
            <Field label="Lighting intent" hint="How the light should feel (e.g. “sodium streetlight, hard shadows”).">
              <textarea rows={2} className={input} {...text("lighting_intent")} />
            </Field>
            <Field label="Sound intent" hint="Ambience, key effects and how music should sit.">
              <textarea rows={2} className={input} {...text("sound_intent")} />
            </Field>
            <Suggest items={p.sound_candidates.map((s) => ({ value: s.cue, line: s.line, text: s.text }))} onUse={(v) => appendTo("sound_intent", v)} />
            <div>
              <span className="text-xs uppercase tracking-wider text-white/50">Camera energy</span>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Camera energy">
                {ENERGY.map((e) => (
                  <button
                    key={e.value}
                    role="radio"
                    aria-checked={form.camera_energy === e.value}
                    onClick={() => set("camera_energy", form.camera_energy === e.value ? null : e.value)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${form.camera_energy === e.value ? "border-aura-gold bg-aura-gold/15 text-aura-gold" : "border-aura-border text-white/60"}`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "Performance" && (
          <>
            {entry.story_time && entry.story_time.cues.length > 0 && (
              <div role="note" aria-label="Story time" className="rounded-lg border border-sky-400/40 bg-sky-400/5 p-3 text-sm">
                <p className="text-sky-200">
                  {entry.story_time.other_time ? "The script suggests this scene happens at another time — choose each character's age below." : "The script marks a return to the present."}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {entry.story_time.cues.map((c) => `“${c.text}” (${c.where === "heading" ? "heading" : `line ${c.line}`})`).join(" · ")}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs uppercase tracking-wider text-white/50">Characters in scene</span>
              {p.participants.length === 0 && <p className="mt-1 text-sm text-white/40">Casting found nobody in this scene.</p>}
              <ul className="mt-2 space-y-2">
                {p.participants.map((c) => {
                  const looks = entry.looks.filter((l) => l.character_id === c.character_id);
                  const chosen = form.wardrobe[c.character_id] ?? "";
                  return (
                    <li key={c.character_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-aura-border px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{c.name}</span>
                        <span className="text-[11px] text-white/40">
                          {c.presence === "voice_only" ? "Voice only" : "On screen"} · {c.line_count} {c.line_count === 1 ? "line" : "lines"}
                        </span>
                      </span>
                      {c.presence === "on_screen" && (
                        <select
                          aria-label={`Wardrobe for ${c.name}`}
                          value={chosen}
                          onChange={(e) => {
                            const w = { ...form.wardrobe };
                            if (e.target.value) w[c.character_id] = e.target.value;
                            else delete w[c.character_id];
                            set("wardrobe", w);
                          }}
                          className="rounded-md border border-aura-border bg-black/40 px-2 py-1 text-sm"
                        >
                          <option value="">{looks.length ? "Choose a look…" : "No looks yet (add in Casting)"}</option>
                          {looks.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {c.presence === "on_screen" && (() => {
                        const ages = (entry.ages ?? []).filter((a) => a.character_id === c.character_id);
                        const chosenAge = (form.ages ?? {})[c.character_id] ?? "";
                        return (
                          <select
                            aria-label={`Age of ${c.name} in this scene`}
                            value={chosenAge}
                            disabled={ages.length === 0 && !chosenAge}
                            title={ages.length ? undefined : "Add other ages for this character in Casting → Ages"}
                            onChange={(e) => {
                              const next = { ...(form.ages ?? {}) };
                              if (e.target.value) next[c.character_id] = e.target.value;
                              else delete next[c.character_id];
                              set("ages", next);
                            }}
                            className="rounded-md border border-aura-border bg-black/40 px-2 py-1 text-sm disabled:opacity-50"
                          >
                            <option value="">{ages.length ? "Age as in the profile" : "No other ages (add in Casting)"}</option>
                            {ages.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label} ({a.age})
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-lg border border-aura-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wider text-white/50">Dialogue in scene</p>
              {p.dialogue.total === 0 ? (
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={form.silent_scene} onChange={(e) => set("silent_scene", e.target.checked)} />
                  This is a silent scene (no dialogue intended)
                </label>
              ) : (
                <p className="mt-1 text-white/70">
                  {p.dialogue.approved} of {p.dialogue.total} lines approved
                  {p.dialogue.needs_review ? `, ${p.dialogue.needs_review} need review` : ""}
                  {p.dialogue.peak_intensity !== null ? ` · peak intensity ${p.dialogue.peak_intensity}/10` : ""}
                  {p.dialogue.emotions.length ? ` · ${p.dialogue.emotions.map((e) => `${e.emotion} ×${e.count}`).join(", ")}` : ""}
                </p>
              )}
            </div>
          </>
        )}

        {tab === "Continuity" && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact label="Previous scene" value={p.continuity.previous ? `${p.continuity.previous.number}. ${p.continuity.previous.heading}` : "—"} />
              <Fact label="This scene" value={`${entry.scene.number}. ${entry.scene.heading}`} highlight />
              <Fact label="Next scene" value={p.continuity.next ? `${p.continuity.next.number}. ${p.continuity.next.heading}` : "—"} />
            </div>
            {p.continuity.notes.length === 0 ? (
              <p className="text-white/40">No continuity links detected from the scene headings.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-white/70">
                {p.continuity.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "Notes" && (
          <Field label="Notes & references" hint="Anything the storyboard, camera, art or sound teams should know.">
            <textarea rows={8} className={input} {...text("notes")} />
          </Field>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-aura-border p-4">
        {dirty && <span className="text-xs text-white/50">Unsaved changes</span>}
        <button onClick={() => setForm(base)} disabled={!dirty || busy} className="rounded-md border border-aura-border px-4 py-1.5 text-sm disabled:opacity-40">
          Undo changes
        </button>
        <button onClick={save} disabled={!dirty || busy} className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">
          {busy ? "Saving…" : "Save Scene DNA"}
        </button>
      </div>
    </div>
  );
}

function Fact({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-aura-gold/50" : "border-aura-border"}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
