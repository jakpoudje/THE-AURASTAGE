"use client";

// Browse and search the written guides; troubleshooting explains error codes shown in the app.
import { useMemo, useState } from "react";
import type { Guide, Trouble } from "../api/helpApi";

const MODULE_LABEL: Record<string, string> = { general: "Getting started", script: "Scriptwriter", casting: "Casting & Characters", dialogue: "Dialogue Intelligence",
  scene_dna: "Scene DNA", shots: "Storyboard & Shots", generation: "Visual Generation", audio: "Audio Studio", editorial: "Editorial & Timeline",
  delivery: "Export & Deliver", team: "Team & Collaboration" };

export function Guides({ guides, troubles, focus }: { guides: Guide[]; troubles: Trouble[]; focus: string | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(focus ? guides.find((g) => g.module === focus)?.id ?? null : null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return guides;
    return guides.filter((g) => `${g.title} ${g.summary} ${g.steps.join(" ")} ${(g.keywords ?? []).join(" ")}`.toLowerCase().includes(t));
  }, [q, guides]);
  const tShown = troubles.filter((t) => !q.trim() || `${t.code} ${t.title} ${t.meaning}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-4">
      <input aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides and error codes…"
        className="w-full rounded-lg border border-aura-border bg-black/40 px-4 py-3 text-sm outline-none focus:border-aura-gold" />
      <div className="grid gap-3 md:grid-cols-2" role="list" aria-label="Guides">
        {shown.map((g) => (
          <div key={g.id} role="listitem" className={`rounded-lg border bg-aura-panel p-4 ${open === g.id ? "border-aura-gold" : "border-aura-border"}`}>
            <div className="text-[10px] uppercase tracking-wider text-aura-gold">{MODULE_LABEL[g.module] ?? g.module}</div>
            <button onClick={() => setOpen(open === g.id ? null : g.id)} className="mt-1 text-left font-display text-base hover:text-aura-gold">{g.title}</button>
            <p className="mt-1 text-xs text-white/60">{g.summary}</p>
            {open === g.id && <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-white/70">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          </div>
        ))}
        {!shown.length && <p className="text-sm text-white/50">No guide matches — try the assistant, or open a ticket.</p>}
      </div>
      <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
        <h2 className="font-display text-lg">Troubleshooting</h2>
        <ul className="mt-2 space-y-2 text-sm" aria-label="Troubleshooting">
          {tShown.map((t) => (
            <li key={t.code}>
              <span className="font-mono text-xs text-aura-gold">{t.code}</span> <span className="font-medium">{t.title}</span>
              <div className="text-xs text-white/60">{t.meaning} {t.fix}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
