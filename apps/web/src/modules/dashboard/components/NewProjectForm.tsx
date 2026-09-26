"use client";

// New project (dashboard). Title is required; everything else can be filled
// in later in Scriptwriter → Project Setup. Long story text goes in Synopsis;
// if it's pasted into the logline box we move it there rather than reject it.

import { useState } from "react";

export const LOGLINE_MAX = 500;
export const SYNOPSIS_MAX = 20000;

export interface NewProjectInput {
  title: string;
  genre?: string;
  logline?: string;
  synopsis?: string;
  target_runtime_minutes?: number;
}

const field = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

export function NewProjectForm({ onCreate }: { onCreate: (input: NewProjectInput) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [logline, setLogline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [runtime, setRuntime] = useState("120");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loglineTooLong = logline.trim().length > LOGLINE_MAX;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!title.trim()) return setError("Please give your project a title.");
    const minutes = Number(runtime);
    if (runtime.trim() && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) {
      return setError("Target runtime must be a whole number of minutes between 1 and 600.");
    }
    let finalLogline = logline.trim();
    let finalSynopsis = synopsis.trim();
    if (finalLogline.length > LOGLINE_MAX) {
      // A pasted story outline: keep every word by moving it to the synopsis.
      finalSynopsis = finalSynopsis ? `${finalLogline}\n\n${finalSynopsis}` : finalLogline;
      finalLogline = "";
    }
    if (finalSynopsis.length > SYNOPSIS_MAX) {
      return setError(`The synopsis is ${finalSynopsis.length.toLocaleString()} characters; the limit is ${SYNOPSIS_MAX.toLocaleString()}.`);
    }
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        genre: genre.trim() || undefined,
        logline: finalLogline || undefined,
        synopsis: finalSynopsis || undefined,
        target_runtime_minutes: runtime.trim() ? minutes : undefined,
      });
      setTitle("");
      setGenre("");
      setLogline("");
      setSynopsis("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
        + New Project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-lg border border-aura-border bg-aura-panel p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <input placeholder="Project title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className={field} />
        <input placeholder="Genre (optional)" value={genre} onChange={(e) => setGenre(e.target.value)} maxLength={100} className={field} />
      </div>
      <div>
        <textarea
          placeholder="Logline (optional) — one or two sentences: who wants what, and what stands in the way"
          value={logline}
          onChange={(e) => setLogline(e.target.value)}
          rows={2}
          className={field}
        />
        <p className={`mt-1 text-right text-[11px] ${loglineTooLong ? "text-aura-gold" : "text-white/40"}`}>
          {logline.trim().length}/{LOGLINE_MAX}
          {loglineTooLong && " — that's longer than a logline, so it will be saved as your story synopsis"}
        </p>
      </div>
      <div>
        <textarea
          placeholder="Story synopsis (optional) — acts, key events, the ending. As long as you need."
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={5}
          className={field}
        />
        <p className="mt-1 text-right text-[11px] text-white/40">
          {synopsis.trim().length.toLocaleString()}/{SYNOPSIS_MAX.toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="np-runtime" className="text-xs text-white/60">
          Target runtime (min)
        </label>
        <input
          id="np-runtime"
          type="number"
          value={runtime}
          onChange={(e) => setRuntime(e.target.value)}
          className="w-24 rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          {submitting ? "Creating…" : "Create project"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-aura-border px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
