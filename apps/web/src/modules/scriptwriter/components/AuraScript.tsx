"use client";

// AuraScript (INTELLIGENCE_PLAN Phase 2): Story Development → Outline & Structure → Generate Script, plus scene tools and
// the continuity check in Edit & Refine. Every step runs in the background (Claude, or the labelled test writer), shows
// its checks, and changes nothing until the writer accepts it: story fields are applied one by one, scripts and reworked
// scenes open as a NEW draft version that the writer reviews and approves as usual.
import { useEffect, useMemo, useState } from "react";
import { writingApi, type ContinuityFinding, type OutlineScene, type RewriteMode, type WritingCheck, type WritingResult } from "../api/writingApi";
import type { useWriting } from "../hooks/useWriting";

type W = ReturnType<typeof useWriting>;
const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

function Status({ r }: { r: WritingResult }) {
  const p = r.progress ?? {};
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid={`writing-status-${r.kind}`}>
      <span className={`rounded-full border px-2 py-0.5 ${r.status === "succeeded" ? "border-emerald-400/60 text-emerald-300" : r.status === "failed" ? "border-red-400/60 text-red-300" : "border-sky-400/60 text-sky-300"}`}>
        {r.status === "queued" ? "Waiting for the writer…" : r.status === "running" ? (p.total ? `Writing — ${p.done ?? 0} of ${p.total} scenes` : "Writing…") : r.status === "succeeded" ? "Done" : "Failed"}
      </span>
      {r.status === "running" && p.total ? (
        <span className="h-1.5 w-40 overflow-hidden rounded bg-white/10" aria-label="Progress"><span className="block h-full bg-sky-400" style={{ width: `${Math.round(((p.done ?? 0) / p.total) * 100)}%` }} /></span>
      ) : null}
      {r.test_output && <span className="rounded bg-amber-500/90 px-1.5 font-semibold text-black" title="Made by the labelled test writer — connect Claude for real writing">TEST OUTPUT</span>}
      {r.status === "succeeded" && !r.test_output && r.provider && <span className="text-white/40">by {r.provider === "anthropic" ? "Claude" : r.provider}{r.model ? ` (${r.model})` : ""}</span>}
      {r.error && <span className="text-red-300">{r.error}</span>}
    </div>
  );
}
function Checks({ checks }: { checks: WritingCheck[] }) {
  if (!checks?.length) return null;
  return (
    <ul aria-label="Checks" className="mt-2 space-y-0.5 text-xs">
      {checks.map((c) => (
        <li key={c.id} className={c.ok ? "text-emerald-300" : "text-amber-300"}>{c.ok ? "✓" : "!"} {c.label} <span className="text-white/40">— {c.evidence}</span></li>
      ))}
    </ul>
  );
}

// ---- Story Development ---------------------------------------------------------------------------------------------
const STORY_FIELDS = [["logline", "Logline"], ["synopsis", "Synopsis"], ["genre", "Genre"], ["tone", "Tone"], ["setting", "Setting"], ["time_period", "Time period"]] as const;
export function StoryDevelopmentPanel({ w, canEdit, onApplied }: { w: W; canEdit: boolean; onApplied: () => void }) {
  const [req, setReq] = useState("");
  const r = w.latest("develop_story");
  const o = r?.status === "succeeded" ? r.output : null;
  const [pick, setPick] = useState<Set<string>>(new Set(["logline", "synopsis"]));
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => setTitle(null), [r?.id]);
  return (
    <section aria-label="Story Development" className="space-y-4">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <p className="text-sm text-white/60">AuraStage reads your Project Setup and proposes the story: title options, logline, synopsis, themes, characters (with why each name fits) and the beats across the acts. Nothing changes until you apply it.</p>
        <textarea aria-label="What should the story do?" rows={2} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Optional: e.g. make the antagonist sympathetic; end on a twist" className={`${input} mt-3`} />
        <button onClick={() => w.request("develop_story", { request: req })} disabled={!canEdit || w.busy || r?.status === "queued" || r?.status === "running"}
          className="mt-2 rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{o ? "Develop again" : "Develop the story"}</button>
      </div>
      {r && (
        <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
          <Status r={r} />
          {o && (
            <div className="mt-3 space-y-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/50">Title</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(o.title_options as string[]).map((t) => (
                    <button key={t} onClick={() => setTitle(t === title ? null : t)} className={`rounded-full border px-3 py-1 ${title === t ? "border-aura-gold text-aura-gold" : "border-aura-border text-white/70"}`}>{t}</button>
                  ))}
                </div>
              </div>
              {STORY_FIELDS.map(([k, label]) => (
                <label key={k} className="flex gap-3">
                  <input type="checkbox" aria-label={`Apply ${label}`} checked={pick.has(k)} onChange={(e) => { const s = new Set(pick); if (e.target.checked) s.add(k); else s.delete(k); setPick(s); }} className="mt-1" />
                  <span><span className="text-[11px] uppercase tracking-wider text-white/50">{label}</span><span className={`block whitespace-pre-wrap text-white/85 ${k === "synopsis" ? "max-h-48 overflow-y-auto" : ""}`}>{String(o[k] ?? "")}</span></span>
                </label>
              ))}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/50">Characters</div>
                <ul aria-label="Proposed characters" className="mt-1 grid gap-2 md:grid-cols-2">
                  {(o.characters as any[]).map((c) => (
                    <li key={c.name} className="rounded-lg border border-aura-border p-2">
                      <div className="font-medium">{c.name} <span className="text-xs capitalize text-white/50">· {c.role}{c.age !== null ? ` · ${c.age}` : ""}</span></div>
                      <p className="text-xs text-white/70">{c.description}</p>
                      <p className="mt-1 text-[11px] text-white/45">Name: {c.name_reasoning}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-white/40">Characters are created in Casting from the approved script, so they appear there once the script is written and approved.</p>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/50">Beats</div>
                <ol aria-label="Story beats" className="mt-1 space-y-1 text-xs">
                  {(o.beats as any[]).map((b, i) => <li key={i}><span className="text-aura-gold">Act {b.act} · ~{b.approx_minute}′</span> <b>{b.title}</b> — <span className="text-white/70">{b.summary}</span></li>)}
                </ol>
              </div>
              {o.assumptions?.length > 0 && <p className="text-xs text-white/50">Assumed: {(o.assumptions as string[]).join(" · ")}</p>}
              <Checks checks={r.checks} />
              <button onClick={async () => { const fields = [...pick, ...(title ? ["title"] : [])]; if (await w.applyStory(r.id, fields, title ?? undefined)) onApplied(); }}
                disabled={!canEdit || w.busy || (!pick.size && !title)} className="rounded-md border border-aura-gold/60 px-4 py-2 text-aura-gold disabled:opacity-40">
                Apply selected to Project Setup
              </button>
              {r.accepted?.fields && <span className="ml-2 text-xs text-emerald-300">Applied: {r.accepted.fields.join(", ")}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Outline -------------------------------------------------------------------------------------------------------
export function OutlinePanel({ w, canEdit }: { w: W; canEdit: boolean }) {
  const [req, setReq] = useState("");
  const r = w.latest("outline");
  const done = w.latestDone("outline");
  const dev = w.latestDone("develop_story");
  const [scenes, setScenes] = useState<OutlineScene[]>([]);
  useEffect(() => setScenes(done?.output?.scenes ?? []), [done?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(scenes) !== JSON.stringify(done?.output?.scenes ?? []);
  const total = Math.round(scenes.reduce((a, s) => a + Number(s.est_minutes || 0), 0));
  const set = (i: number, patch: Partial<OutlineScene>) => setScenes(scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const a = [...scenes]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); setScenes(a.map((s, k) => ({ ...s, number: k + 1 }))); };
  return (
    <section aria-label="Scene outline" className="space-y-3">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <p className="text-sm text-white/60">A scene-by-scene outline {dev ? "from your story development" : "from your Project Setup"}, sized to the target runtime. Edit anything — your edits are saved as your own version and the script is written from it.</p>
        <textarea aria-label="Outline request" rows={2} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Optional: e.g. open on the harbour; keep it under 25 scenes" className={`${input} mt-3`} />
        <button onClick={() => w.request("outline", { request: req, parent_id: dev?.id ?? null })} disabled={!canEdit || w.busy || r?.status === "queued" || r?.status === "running"}
          className="mt-2 rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{done ? "Build a new outline" : "Build the scene outline"}</button>
      </div>
      {r && r.id !== done?.id && <div className="rounded-xl border border-aura-border bg-aura-panel p-4"><Status r={r} /></div>}
      {done && (
        <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Status r={done} />
            <span className="text-xs text-white/50" data-testid="outline-summary">{scenes.length} scenes · {total} minutes{done.source === "user" ? " · your edited version" : ""}</span>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setScenes([...scenes, { number: scenes.length + 1, int_ext: "INT", location: "NEW PLACE", time_of_day: "DAY", purpose: "", beat: "", summary: "What happens.", characters: [], est_minutes: 2 }])}
                disabled={!canEdit} className="rounded border border-aura-border px-2 py-1 text-xs">+ Scene</button>
              {dirty && <button onClick={() => setScenes(done.output.scenes)} className="rounded border border-aura-border px-2 py-1 text-xs">Discard</button>}
              <button onClick={() => w.saveOutline(done.id, scenes)} disabled={!canEdit || !dirty || w.busy} className="rounded bg-aura-gold px-3 py-1 text-xs font-medium text-black disabled:opacity-40">Save outline</button>
            </div>
          </div>
          <Checks checks={done.checks} />
          <ol aria-label="Outline scenes" className="mt-3 space-y-2">
            {scenes.map((s, i) => (
              <li key={i} className="grid gap-2 rounded-lg border border-aura-border p-2 text-xs md:grid-cols-[40px_90px_1fr_110px_70px_auto]">
                <span className="self-center text-white/50">{i + 1}</span>
                <select aria-label={`Scene ${i + 1} interior or exterior`} value={s.int_ext} onChange={(e) => set(i, { int_ext: e.target.value as OutlineScene["int_ext"] })} className="rounded border border-aura-border bg-black px-1">
                  <option>INT</option><option>EXT</option><option>INT/EXT</option>
                </select>
                <div className="space-y-1">
                  <input aria-label={`Scene ${i + 1} place`} value={s.location} onChange={(e) => set(i, { location: e.target.value.toUpperCase() })} className="w-full rounded border border-aura-border bg-black px-1 font-mono" />
                  <textarea aria-label={`Scene ${i + 1} summary`} rows={2} value={s.summary} onChange={(e) => set(i, { summary: e.target.value })} className="w-full rounded border border-aura-border bg-black px-1" />
                  <input aria-label={`Scene ${i + 1} characters`} value={s.characters.join(", ")} onChange={(e) => set(i, { characters: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Characters" className="w-full rounded border border-aura-border bg-black px-1 text-white/70" />
                </div>
                <input aria-label={`Scene ${i + 1} time`} value={s.time_of_day} onChange={(e) => set(i, { time_of_day: e.target.value.toUpperCase() })} className="h-7 rounded border border-aura-border bg-black px-1" />
                <label className="text-white/50">min<input aria-label={`Scene ${i + 1} minutes`} type="number" min={0.2} max={20} step={0.5} value={s.est_minutes} onChange={(e) => set(i, { est_minutes: Number(e.target.value) })} className="w-full rounded border border-aura-border bg-black px-1 text-white" /></label>
                <div className="flex gap-1 self-start">
                  <button aria-label={`Move scene ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-aura-border px-1.5 disabled:opacity-30">↑</button>
                  <button aria-label={`Move scene ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === scenes.length - 1} className="rounded border border-aura-border px-1.5 disabled:opacity-30">↓</button>
                  <button aria-label={`Remove scene ${i + 1}`} onClick={() => setScenes(scenes.filter((_, k) => k !== i).map((x, k) => ({ ...x, number: k + 1 })))} className="rounded border border-aura-border px-1.5 text-red-300">✕</button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// ---- Generate Script -----------------------------------------------------------------------------------------------
export function GenerateScriptPanel({ w, canEdit, currentVersionId, onOpened }: { w: W; canEdit: boolean; currentVersionId: string | null; onOpened: () => void }) {
  const [req, setReq] = useState("");
  const outline = w.latestDone("outline");
  const r = w.latest("write_script");
  const scenes: { number: number; fountain: string }[] = r?.output?.scenes ?? [];
  const preview = useMemo(() => scenes.map((s) => s.fountain.trim()).join("\n\n"), [scenes]);
  const running = r?.status === "queued" || r?.status === "running";
  return (
    <section aria-label="Generate script" className="space-y-3">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        {outline ? (
          <p className="text-sm text-white/60">Writes the full screenplay from your outline ({outline.output.scenes.length} scenes), scene by scene in the background — you can leave this page. The result opens as a new draft version for you to review and approve.</p>
        ) : <p className="text-sm text-amber-300">Build a scene outline first (Outline & Structure) — the script is written from it.</p>}
        <textarea aria-label="Script request" rows={2} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Optional: e.g. lean dialogue; Nigerian Pidgin where natural" className={`${input} mt-3`} />
        <button onClick={() => w.request("write_script", { request: req, parent_id: outline!.id })} disabled={!canEdit || !outline || w.busy || running}
          className="mt-2 rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Write the full script</button>
      </div>
      {r && (
        <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
          <Status r={r} />
          <Checks checks={r.checks} />
          {scenes.length > 0 && (
            <>
              <pre aria-label="Script preview" className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/60 p-4 font-mono text-xs leading-5 text-white/85">{preview}</pre>
              {r.status === "succeeded" && (
                r.result_version_id
                  ? <p className="mt-2 text-sm text-emerald-300">Opened as a draft version — find it in Edit & Refine.</p>
                  : <button onClick={async () => { if (await w.openDraft(r.id, currentVersionId)) onOpened(); }} disabled={!canEdit || w.busy}
                      className="mt-3 rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Open as a new draft version</button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Scene tools + continuity (Edit & Refine) ---------------------------------------------------------------------
const MODES: [RewriteMode, string][] = [["improve", "Improve"], ["expand", "Expand"], ["rephrase", "Rephrase"], ["condense", "Condense"], ["dialogue", "Sharpen dialogue"], ["new_scene", "New scene after"]];
export function ScriptToolsPanel({ w, projectId, canEdit, sceneNumbers, currentVersionId, dirty, onOpened }: {
  w: W; projectId: string; canEdit: boolean; sceneNumbers: number[]; currentVersionId: string | null; dirty: boolean; onOpened: () => void;
}) {
  const [n, setN] = useState<number>(sceneNumbers[0] ?? 1);
  const [instr, setInstr] = useState("");
  const [cont, setCont] = useState<{ findings: ContinuityFinding[]; summary: { warnings: number; notes: number }; version_number: number } | null>(null);
  const [contErr, setContErr] = useState<string | null>(null);
  const r = w.latest("rewrite_scene");
  const stale = r && r.base_version_id !== currentVersionId;
  return (
    <section aria-label="AI tools" className="space-y-3 rounded-xl border border-aura-border bg-aura-panel p-4 text-sm">
      <h3 className="font-display text-lg">AI tools</h3>
      {w.writer?.test_output && <p className="rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200">No writing model is connected — the labelled test writer is used.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-white/50">Scene
          <select aria-label="Scene to rework" value={n} onChange={(e) => setN(Number(e.target.value))} className="block rounded border border-aura-border bg-black px-2 py-1 text-white">
            {sceneNumbers.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <input aria-label="Instruction" value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Optional instruction" className="min-w-0 flex-1 rounded border border-aura-border bg-black px-2 py-1" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map(([m, label]) => (
          <button key={m} onClick={() => w.request("rewrite_scene", { scene: { mode: m, number: n, instruction: instr } })} disabled={!canEdit || w.busy || !sceneNumbers.length || dirty}
            title={dirty ? "Save your version first — tools work on the saved script" : undefined} className="rounded border border-aura-gold/50 px-2 py-1 text-xs text-aura-gold disabled:opacity-40">{label}{m === "new_scene" ? ` ${n}` : ""}</button>
        ))}
      </div>
      {dirty && <p className="text-[11px] text-white/40">Save your version first — the tools work on the saved script.</p>}
      {r && (
        <div className="space-y-2 border-t border-aura-border pt-2">
          <div className="text-xs text-white/60">{r.scene?.mode === "new_scene" ? `New scene after scene ${r.scene?.number}` : `Scene ${r.scene?.number} · ${r.scene?.mode}`}</div>
          <Status r={r} />
          {r.status === "succeeded" && (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                {r.scene?.before_text && <pre aria-label="Before" className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-black/50 p-2 font-mono text-[11px] text-white/60">{r.scene.before_text}</pre>}
                <pre aria-label="After" className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-black/70 p-2 font-mono text-[11px] text-white/90">{r.output.fountain}</pre>
              </div>
              {r.output.changes?.length > 0 && <ul className="list-disc pl-5 text-xs text-white/60">{(r.output.changes as string[]).map((c) => <li key={c}>{c}</li>)}</ul>}
              <Checks checks={r.checks} />
              {r.result_version_id ? <p className="text-xs text-emerald-300">Used — opened as a new draft version.</p>
                : stale ? <p className="text-xs text-amber-300">The script changed since this was written — ask again.</p>
                : <button onClick={async () => { if (await w.openDraft(r.id, currentVersionId)) onOpened(); }} disabled={!canEdit || w.busy || dirty} className="rounded bg-aura-gold px-3 py-1 text-xs font-medium text-black disabled:opacity-40">Use this (new draft version)</button>}
            </>
          )}
        </div>
      )}
      <div className="border-t border-aura-border pt-2">
        <button onClick={async () => { setContErr(null); try { setCont(await writingApi.continuity(projectId)); } catch (e) { setContErr(e instanceof Error ? e.message : "Couldn't check"); } }}
          className="rounded border border-aura-border px-3 py-1 text-xs">Continuity check</button>
        {contErr && <p className="mt-1 text-xs text-red-300">{contErr}</p>}
        {cont && (
          <div className="mt-2 text-xs">
            <p className="text-white/60" data-testid="continuity-summary">Version {cont.version_number}: {cont.summary.warnings} warning{cont.summary.warnings === 1 ? "" : "s"}, {cont.summary.notes} note{cont.summary.notes === 1 ? "" : "s"}.</p>
            <ul aria-label="Continuity findings" className="mt-1 space-y-1">
              {cont.findings.map((f, i) => <li key={i} className={f.severity === "warning" ? "text-amber-300" : "text-white/70"}>{f.scene_number ? `Scene ${f.scene_number}, ` : ""}line {f.line}: {f.message}</li>)}
              {!cont.findings.length && <li className="text-emerald-300">✓ Nothing to flag.</li>}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
