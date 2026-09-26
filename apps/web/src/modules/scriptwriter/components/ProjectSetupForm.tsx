"use client";

// Scriptwriter step 1 (UI_REFERENCE §3): the story fields Scriptwriter owns on
// the Project root. Project Settings shows these read-only (SRS §3.1).

import { useState } from "react";
import type { Project, ProjectType, UpdateProjectInput } from "@aurastage/contracts";

const TYPES: { value: ProjectType; label: string }[] = [
  { value: "feature_film", label: "Feature Film" },
  { value: "short_film", label: "Short Film" },
  { value: "series", label: "Series" },
  { value: "documentary", label: "Documentary" },
  { value: "animation", label: "Animation" },
];

const input =
  "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

export function ProjectSetupForm({
  project,
  busy,
  onSave,
}: {
  project: Project;
  busy: boolean;
  onSave: (input: UpdateProjectInput) => void;
}) {
  const [f, setF] = useState({
    title: project.title,
    type: project.type,
    target_runtime_minutes: project.target_runtime_minutes ?? 100,
    genre: project.genre ?? "",
    subgenre: project.subgenre ?? "",
    setting: project.setting ?? "",
    time_period: project.time_period ?? "",
    logline: project.logline ?? "",
    synopsis: project.synopsis ?? "",
    tone: project.tone ?? "",
    audience: project.audience ?? "",
    opening_style: project.opening_style ?? "",
    ending_style: project.ending_style ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: keyof typeof f) => ({
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
    className: input,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Send empty strings (not undefined) so clearing a field actually clears it.
    const opt = (v: string) => v.trim();
    // A pasted story outline in the logline box is kept, as the synopsis.
    let logline = opt(f.logline);
    let synopsis = opt(f.synopsis);
    if (logline.length > 500) {
      synopsis = synopsis ? `${logline}\n\n${synopsis}` : logline;
      logline = "";
      setF((s) => ({ ...s, logline: "", synopsis }));
    }
    onSave({
      title: f.title.trim(),
      type: f.type,
      target_runtime_minutes: f.target_runtime_minutes,
      genre: opt(f.genre),
      subgenre: opt(f.subgenre),
      setting: opt(f.setting),
      time_period: opt(f.time_period),
      logline,
      synopsis,
      tone: opt(f.tone),
      audience: opt(f.audience),
      opening_style: opt(f.opening_style),
      ending_style: opt(f.ending_style),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-aura-border bg-aura-panel p-6">
      <h2 className="font-display text-xl">Project Setup</h2>
      <Field label="Title">
        <input required maxLength={200} {...text("title")} />
      </Field>
      <Field label="Film type">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => set("type", t.value)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                f.type === t.value ? "border-aura-gold bg-aura-gold/15 text-aura-gold" : "border-aura-border text-white/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`Target runtime: ${f.target_runtime_minutes} min`}>
        <input
          type="range"
          min={5}
          max={240}
          step={5}
          value={f.target_runtime_minutes}
          onChange={(e) => set("target_runtime_minutes", Number(e.target.value))}
          className="w-full accent-[#e8b84b]"
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Primary genre">
          <input placeholder="Thriller" maxLength={100} {...text("genre")} />
        </Field>
        <Field label="Subgenre">
          <input placeholder="Political drama" maxLength={100} {...text("subgenre")} />
        </Field>
        <Field label="Setting">
          <input placeholder="Lagos, Nigeria" maxLength={200} {...text("setting")} />
        </Field>
        <Field label="Time period">
          <input placeholder="Present day" maxLength={100} {...text("time_period")} />
        </Field>
      </div>
      <Field label={`Logline (${f.logline.trim().length}/500)`}>
        <textarea rows={2} placeholder="One or two sentences: who wants what, and what stands in the way." {...text("logline")} />
      </Field>
      {f.logline.trim().length > 500 && (
        <p className="-mt-2 text-xs text-aura-gold">That's longer than a logline — it will be saved as your story synopsis.</p>
      )}
      <Field label={`Story synopsis (${f.synopsis.trim().length.toLocaleString()}/20,000)`}>
        <textarea rows={6} maxLength={20000} placeholder="Acts, key events, the ending — as long as you need." {...text("synopsis")} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tone">
          <input placeholder="Tense, grounded" maxLength={100} {...text("tone")} />
        </Field>
        <Field label="Audience">
          <input placeholder="Adults 18+" maxLength={100} {...text("audience")} />
        </Field>
        <Field label="Opening style">
          <input placeholder="Cold open" maxLength={100} {...text("opening_style")} />
        </Field>
        <Field label="Ending style">
          <input placeholder="Open-ended" maxLength={100} {...text("ending_style")} />
        </Field>
      </div>
      <button type="submit" disabled={busy} className="rounded-md bg-aura-gold px-5 py-2 text-sm font-medium text-black disabled:opacity-50">
        {busy ? "Saving…" : "Save story setup"}
      </button>
    </form>
  );
}
