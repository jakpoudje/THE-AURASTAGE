"use client";

// The AuraStage Assistant: answers from the written guides and, for a project you can open,
// that project's own diagnostics. It explains and navigates; it never changes anything.
import Link from "next/link";
import { useState } from "react";
import { helpApi, type AssistantAnswer } from "../api/helpApi";

const PATH: Record<string, string> = { script: "scriptwriter", casting: "casting", dialogue: "dialogue", scene_dna: "scene-dna", shots: "storyboard",
  generation: "visual", audio: "audio", editorial: "editorial", delivery: "export", team: "team" };

export function Assistant({ projectId, module }: { projectId: string | null; module: string | null }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setAnswer(await helpApi.ask(q, projectId, module));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant couldn't answer");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-aura-gold/40 bg-aura-panel p-4" aria-label="AuraStage Assistant" role="region">
      <h2 className="font-display text-lg">AuraStage Assistant</h2>
      <p className="mt-1 text-xs text-white/50">
        {projectId ? "Knows which project and workspace you came from, and checks that project's status." : "Open Help from a project to include its status."}
      </p>
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <input aria-label="Ask the assistant" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Why can't I render?"
          className="min-w-0 flex-1 rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold" />
        <button disabled={busy || q.trim().length < 2} className="rounded-md bg-aura-gold px-3 py-2 text-sm text-black disabled:opacity-50">{busy ? "…" : "Ask"}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {answer && (
        <div className="mt-3 space-y-3 text-sm" data-testid="assistant-answer">
          {answer.findings.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/50">In this project right now</div>
              <ul className="mt-1 space-y-1">
                {answer.findings.map((f, i) => (
                  <li key={i} className={f.severity === "problem" ? "text-red-300" : f.severity === "warning" ? "text-aura-gold" : "text-white/70"}>
                    {f.message}
                    {projectId && PATH[f.module] && <> · <Link className="underline" href={`/projects/${projectId}/${PATH[f.module]}`}>open</Link></>}
                    <div className="text-[10px] text-white/40">{f.evidence}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {answer.troubleshooting.map((t) => (
            <div key={t.code} className="rounded-md border border-aura-border p-2">
              <div className="font-medium">{t.code}: {t.title}</div>
              <div className="text-xs text-white/60">{t.meaning} {t.fix}</div>
            </div>
          ))}
          {answer.guides.map((g) => (
            <div key={g.id}>
              <div className="font-medium">{g.title}</div>
              <p className="text-xs text-white/60">{g.summary}</p>
              <ol className="mt-1 list-decimal pl-5 text-xs text-white/70">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              {projectId && PATH[g.module] && <Link className="text-xs text-aura-gold underline" href={`/projects/${projectId}/${PATH[g.module]}`}>Go there →</Link>}
            </div>
          ))}
          <p className="text-[10px] text-white/40">{answer.note}</p>
        </div>
      )}
    </div>
  );
}
