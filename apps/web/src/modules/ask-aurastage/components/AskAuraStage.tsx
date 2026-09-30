"use client";

// Ask AuraStage (INTELLIGENCE_PLAN.md §4.6): a plain-language request in any workspace becomes a proposal —
// field-level before → after, what it may flag downstream, what it can't do — and changes nothing until you apply it.
// Applied changes can be undone. Output from the built-in test planner is labelled DEVELOPMENT / TEST OUTPUT (rule 12).

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { announceAssistantChange } from "../askBus";
import { CostNote, estimateCost } from "@/components/CostNote";
import { assistantApi, type AssistantModule, type Proposal } from "../api/assistantApi";

const FIELD = (k: string) => k.replace(/_/g, " ");
const show = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : typeof v === "object" ? Object.entries(v as object).filter(([k]) => k !== "id").map(([k, x]) => `${FIELD(k)}: ${show(x)}`).join("; ") : String(v);
const STATUS: Record<string, string> = {
  queued: "Waiting for AuraStage…", planning: "Thinking…", proposed: "Suggested", applying: "Applying…", applied: "Applied",
  rejected: "Discarded", failed: "Couldn't finish", undone: "Undone",
};
const EXAMPLES: Partial<Record<AssistantModule, string>> = {
  scene_dna: "Make scene 2 night, rainy and more tense",
  casting: "Make Amara approximately 45",
  dialogue: "Make Amara's lines in scene 1 more subtle",
  shots: "Make the last shot of scene 1 a close-up that pushes in",
  script: "Change the tone to Tense and brooding",
};

export function AskAuraStage({ projectId, module, request, onClose }: { projectId: string; module: AssistantModule; request?: { text: string; n: number } | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [current, setCurrent] = useState<Proposal | null>(null);
  const [recent, setRecent] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What asking will cost (owner request 2026-09-30): priced from the exact prompt, refreshed as the request is typed.
  const [cost, setCost] = useState<{ provider: string; model: string | null; input_chars: number; output_chars: number } | null>(null);
  useEffect(() => {
    if (text.trim().length < 3) return setCost(null);
    const t = setTimeout(() => assistantApi.estimate(projectId, { module, text }).then(setCost).catch(() => setCost(null)), 500);
    return () => clearTimeout(t);
  }, [projectId, module, text]);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRecent = useCallback(() => assistantApi.list(projectId).then((r) => setRecent(r.proposals)).catch(() => null), [projectId]);
  useEffect(() => {
    loadRecent();
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [loadRecent]);

  const open = useCallback(async (id: string, tries = 0) => {
    if (poll.current) clearTimeout(poll.current);
    const p = await assistantApi.get(id);
    setCurrent(p);
    // Planning runs in the generation worker; check back until it's done (about 2 minutes at most).
    if ((p.status === "queued" || p.status === "planning") && tries < 80) poll.current = setTimeout(() => open(id, tries + 1).catch(() => null), 1500);
    else loadRecent();
  }, [loadRecent]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const ask = (request = text) => run(async () => {
    const p = await assistantApi.ask(projectId, { module, text: request });
    setText("");
    await open(p.id);
  });
  // One pass over a whole scene: every spoken line's performance and the scene's DNA, as one suggestion to review.
  const [passScene, setPassScene] = useState("1");
  // A page asked on the user's behalf (e.g. "Develop this character's profile"). With a paid AI connected the request is
  // filled in with its cost and waits for "Ask" (owner: the cost is shown before anything is spent); the free built-in
  // planner asks straight away.
  const asked = useRef<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!request || asked.current === request.n) return;
    asked.current = request.n;
    setText(request.text);
    assistantApi.estimate(projectId, { module, text: request.text })
      .then((c) => {
        const free = estimateCost([{ provider: c.provider, model: c.model, input_chars: c.input_chars, output_chars: c.output_chars }]).free;
        if (free) ask(request.text);
        else setWaiting(true);
      })
      .catch(() => ask(request.text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.n]);
  const onePass = module === "dialogue" || module === "scene_dna";
  const annotateScene = () => ask(`Annotate scene ${passScene} in one pass: every line's intention, subtext, emotion and intensity, and the scene's Scene DNA (purpose, stakes, mood, atmosphere, lighting, sound and camera energy). Fill what is empty; keep what is already written.`);
  const act = (fn: (id: string) => Promise<Proposal>) => current && run(async () => {
    await fn(current.id);
    await open(current.id);
    announceAssistantChange();
  });

  const p = current;
  return (
    <aside role="complementary" aria-label="Ask AuraStage" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-aura-border bg-aura-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-aura-border px-5 py-4">
        <div>
          <h2 className="font-display text-lg">Ask AuraStage</h2>
          <p className="text-[11px] text-white/50">Describe a change. Nothing changes until you apply it.</p>
        </div>
        <button onClick={onClose} className="rounded-md border border-aura-border px-3 py-1 text-sm">Close</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        <form onSubmit={(e) => (e.preventDefault(), text.trim().length >= 3 && ask())} className="space-y-2">
          <label htmlFor="ask-text" className="text-xs text-white/60">What would you like to change?</label>
          <textarea id="ask-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000}
            placeholder={EXAMPLES[module] ?? "e.g. Make scene 2 night and rainy"}
            className="w-full rounded-md border border-aura-border bg-black/30 px-3 py-2" />
          <button type="submit" disabled={busy || text.trim().length < 3} className="rounded-md bg-aura-gold px-4 py-2 font-medium text-black disabled:opacity-40">
            Ask
          </button>
          {waiting && !current && <p className="text-xs text-aura-gold">Check the cost below, then press Ask.</p>}
          {cost && <CostNote label="Cost of asking" items={[{ provider: cost.provider, model: cost.model, input_chars: cost.input_chars, output_chars: cost.output_chars }]} />}
        </form>
        {onePass && (
          <div className="rounded-md border border-aura-border bg-black/20 p-3" aria-label="One pass for a scene" role="group">
            <p className="mb-2 text-xs text-white/60">Develop a whole scene at once — every line&apos;s performance and its Scene DNA — as one suggestion you review.</p>
            <div className="flex items-center gap-2">
              <label htmlFor="pass-scene" className="text-xs text-white/60">Scene</label>
              <input id="pass-scene" type="number" min={1} value={passScene} onChange={(e) => setPassScene(e.target.value)} className="w-16 rounded-md border border-aura-border bg-black/30 px-2 py-1" />
              <button type="button" disabled={busy || !(Number(passScene) >= 1)} onClick={annotateScene} className="rounded-md border border-aura-gold/60 px-3 py-1 text-aura-gold disabled:opacity-40">
                Annotate scene in one pass
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300">{error}</p>}

        {p && (
          <section aria-label="Suggestion" className="space-y-3 rounded-lg border border-aura-border bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="proposal-status" className="rounded-full border border-white/20 px-2 py-0.5 text-[11px]">{STATUS[p.status] ?? p.status}</span>
              {p.test_output && (
                <span data-testid="test-output" className="rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-300"
                  title="Produced by AuraStage's built-in test planner, not AI. Connect Claude for real story understanding.">
                  DEVELOPMENT / TEST OUTPUT
                </span>
              )}
              {p.provider && <span className="text-[11px] text-white/40">{p.provider === "aurastage-test" ? "Built-in test planner" : p.provider} · {p.model}</span>}
            </div>
            <p className="text-white/60">&ldquo;{p.request}&rdquo;</p>
            {p.status === "failed" && <p className="text-red-300">{p.error}</p>}
            {p.plan && <p className="text-base">{p.plan.summary}</p>}

            {p.preview?.calls.map((c) => (
              <div key={c.index} className="rounded-md border border-aura-border p-3" data-testid="change">
                <div className="mb-1 font-medium">{c.object.label || c.object.type}</div>
                <div className="mb-2 text-[11px] text-white/50">{c.reason}</div>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-white/40"><th className="font-normal">Field</th><th className="font-normal">Now</th><th className="font-normal">After</th></tr></thead>
                  <tbody>
                    {Object.entries(c.after).filter(([, v]) => v !== undefined).map(([k, v]) => (
                      <tr key={k} className="align-top">
                        <td className="py-1 pr-2 capitalize text-white/60">{FIELD(k)}</td>
                        <td className="py-1 pr-2 text-white/50 line-through decoration-white/30">{show(c.before?.[k])}</td>
                        <td className="py-1 text-aura-gold">{show(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!c.allowed && <p className="mt-2 text-xs text-red-300">Your role can&apos;t {c.action} in this workspace, so this can&apos;t be applied.</p>}
                {c.stale && <p className="mt-2 text-xs text-amber-300">This changed after AuraStage read it — ask again for an up-to-date suggestion.</p>}
                {c.problem && <p className="mt-2 text-xs text-red-300">{c.problem}</p>}
              </div>
            ))}
            {p.preview?.issues.map((i, n) => <p key={n} className="text-xs text-red-300">{i.tool || "Plan"}: {i.problem}</p>)}

            {p.status === "applied" && p.results?.results?.map((r, n) => (
              <div key={n} className="rounded-md border border-emerald-500/30 p-3 text-xs" data-testid="applied-change">
                <div className="font-medium text-emerald-300">{r.object?.label} updated</div>
                {Object.entries(r.applied).filter(([, v]) => v !== undefined).map(([k, v]) => (
                  <div key={k}><span className="capitalize text-white/50">{FIELD(k)}:</span> {show(r.before?.[k])} → <span className="text-aura-gold">{show(v)}</span></div>
                ))}
              </div>
            ))}

            {!!(p.preview?.impact.length || p.results?.impact?.length) && (
              <div className="text-xs">
                <div className="text-white/50">May flag for review downstream (nothing is deleted):</div>
                <ul className="ml-4 list-disc text-white/70">{(p.preview?.impact ?? p.results?.impact ?? []).map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            )}
            {!!p.plan?.not_possible.length && (
              <div className="text-xs"><div className="text-white/50">Not done here:</div>
                <ul className="ml-4 list-disc text-white/70">{p.plan.not_possible.map((x) => <li key={x}>{x}</li>)}</ul></div>
            )}
            {!!p.plan?.questions.length && (
              <div className="text-xs"><div className="text-white/50">AuraStage needs to know:</div>
                <ul className="ml-4 list-disc text-white/70">{p.plan.questions.map((x) => <li key={x}>{x}</li>)}</ul></div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {p.status === "proposed" && (
                <>
                  <button onClick={() => act(assistantApi.apply)} disabled={busy || !p.preview?.can_apply} className="rounded-md bg-aura-gold px-4 py-2 font-medium text-black disabled:opacity-40">
                    Apply
                  </button>
                  <button onClick={() => act(assistantApi.reject)} disabled={busy} className="rounded-md border border-aura-border px-4 py-2">Discard</button>
                </>
              )}
              {p.status === "applied" && (
                <>
                  <button onClick={() => window.location.reload()} className="rounded-md bg-aura-gold px-4 py-2 font-medium text-black">Show the change</button>
                  <button onClick={() => act(assistantApi.undo)} disabled={busy} className="rounded-md border border-aura-border px-4 py-2">Undo</button>
                </>
              )}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section aria-label="Recent requests">
            <h3 className="mb-2 text-xs uppercase tracking-wider text-white/40">Recent requests</h3>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.id}>
                  <button onClick={() => run(() => open(r.id))} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5">
                    <span className="truncate">{r.request}</span>
                    <span className="shrink-0 text-[11px] text-white/40">{STATUS[r.status] ?? r.status}{r.test_output ? " · test" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
