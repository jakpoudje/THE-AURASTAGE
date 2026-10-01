"use client";
// Version compare (BUILD_PLAN §8 item 13): pick two saved versions; see what changed scene by scene and line by line.
import { useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { VersionSummary } from "../types";

type DiffLine = { op: "same" | "added" | "removed"; text: string };
interface Compare {
  from: { version_number: number }; to: { version_number: number };
  summary: { scenes_from: number; scenes_to: number; added: number; removed: number; changed: number; moved: number; unchanged: number; words_from: number; words_to: number };
  scenes: { status: string; from_number: number | null; to_number: number | null; heading_from: string | null; heading_to: string | null; lines_added: number; lines_removed: number; diff: DiffLine[] }[];
}

export function VersionCompare({ projectId, versions }: { projectId: string; versions: VersionSummary[] }) {
  const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);
  const [from, setFrom] = useState(sorted.length > 1 ? sorted[sorted.length - 2].id : "");
  const [to, setTo] = useState(sorted.length ? sorted[sorted.length - 1].id : "");
  const [r, setR] = useState<Compare | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (sorted.length < 2) return null;
  const run = async () => {
    setErr(null);
    try { setR(await apiGet<Compare>(`/api/projects/${projectId}/script/compare?from=${from}&to=${to}`)); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't compare"); }
  };
  const sel = "rounded-md border border-aura-border bg-black/40 px-2 py-1 text-xs";
  return (
    <section aria-label="Compare versions" className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="mb-2 text-xs uppercase tracking-widest text-aura-gold">Compare versions</h3>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select aria-label="Compare from" value={from} onChange={(e) => setFrom(e.target.value)} className={sel}>{sorted.map((v) => <option key={v.id} value={v.id} className="bg-aura-panel">v{v.version_number}</option>)}</select>
        <span className="text-white/40">→</span>
        <select aria-label="Compare to" value={to} onChange={(e) => setTo(e.target.value)} className={sel}>{sorted.map((v) => <option key={v.id} value={v.id} className="bg-aura-panel">v{v.version_number}</option>)}</select>
        <button onClick={run} disabled={!from || !to || from === to} className="rounded border border-aura-gold/60 px-2 py-1 text-aura-gold disabled:opacity-40">Compare</button>
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-red-300">{err}</p>}
      {r && (
        <div className="mt-3 space-y-2 text-xs">
          <p data-testid="compare-summary" className="text-white/70">
            v{r.from.version_number} → v{r.to.version_number}: {r.summary.changed} changed, {r.summary.added} added, {r.summary.removed} removed, {r.summary.moved} moved, {r.summary.unchanged} unchanged · {r.summary.words_from} → {r.summary.words_to} words
          </p>
          <ul aria-label="Scene changes" className="max-h-96 space-y-2 overflow-y-auto">
            {r.scenes.filter((s) => s.status !== "unchanged").map((s, i) => (
              <li key={i} className="rounded border border-aura-border/60 p-2">
                <div className="mb-1">
                  <span className={s.status === "added" ? "text-emerald-300" : s.status === "removed" ? "text-red-300" : "text-amber-200"}>{s.status}</span>{" "}
                  <span className="text-white/80">{s.heading_to ?? s.heading_from}</span>
                  {s.status === "changed" && <span className="text-white/40"> · +{s.lines_added} −{s.lines_removed}</span>}
                </div>
                {s.diff.slice(0, 40).map((d, k) => (
                  <div key={k} className={`whitespace-pre-wrap font-mono ${d.op === "added" ? "bg-emerald-500/10 text-emerald-200" : d.op === "removed" ? "bg-red-500/10 text-red-200 line-through" : "text-white/40"}`}>
                    {d.op === "added" ? "+ " : d.op === "removed" ? "− " : "  "}{d.text}
                  </div>
                ))}
              </li>
            ))}
            {r.scenes.every((s) => s.status === "unchanged") && <li className="text-emerald-300">No differences.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
