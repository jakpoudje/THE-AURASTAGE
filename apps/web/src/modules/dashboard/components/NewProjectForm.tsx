"use client";

import { useState } from "react";

export function NewProjectForm({
  onCreate,
}: {
  onCreate: (input: { title: string; genre?: string; logline?: string; target_runtime_minutes?: number }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [logline, setLogline] = useState("");
  const [runtime, setRuntime] = useState(120);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({ title, genre: genre || undefined, logline: logline || undefined, target_runtime_minutes: runtime });
      setTitle("");
      setGenre("");
      setLogline("");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black"
      >
        + New Project
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 space-y-3 rounded-lg border border-aura-border bg-aura-panel p-5"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <input
          placeholder="Project title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
        />
        <input
          placeholder="Genre (optional)"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
        />
      </div>
      <textarea
        placeholder="Logline (optional)"
        value={logline}
        onChange={(e) => setLogline(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
      />
      <div className="flex items-center gap-3">
        <label className="text-xs text-white/60">Target runtime (min)</label>
        <input
          type="number"
          min={1}
          max={600}
          value={runtime}
          onChange={(e) => setRuntime(Number(e.target.value))}
          className="w-24 rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create project"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-aura-border px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
