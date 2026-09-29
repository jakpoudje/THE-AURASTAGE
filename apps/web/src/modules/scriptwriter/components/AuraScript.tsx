"use client";

// AuraScript (INTELLIGENCE_PLAN Phase 2): Story Development → Outline & Structure → Generate Script, plus scene tools and
// the continuity check in Edit & Refine. Every step runs in the background (Claude, or the labelled test writer), shows
// its checks, and changes nothing until the writer accepts it: story fields are applied one by one, scripts and reworked
// scenes open as a NEW draft version that the writer reviews and approves as usual.
import { useEffect, useMemo, useState } from "react";
import { writingApi, type ContinuityFinding, type OutlineScene, type RewriteMode, type StoryBeat, type StoryCharacter, type StoryDraft, type WritingCheck, type WritingResult } from "../api/writingApi";
import type { useWriting } from "../hooks/useWriting";

type W = ReturnType<typeof useWriting>;
const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

// What each kind of job actually does, shown in turn while it runs (a description of the real steps, never a
// made-up percentage; the real stage from the worker and real scene counts are shown above it).
const STEPS: Record<WritingResult["kind"], string[]> = {
  develop_story: ["Reading your logline, synopsis, setting and period", "Keeping the character names already decided", "Choosing names that belong to the story's world",
    "Shaping want, need and arc for each character", "Laying the beats out across the acts", "Checking names, runtime and title before showing you"],
  outline: ["Reading the story, its characters and beats", "Sizing the scenes to your target runtime", "Placing each beat in a scene", "Choosing places and times of day",
    "Checking scene order, runtime and main characters"],
  write_script: ["Writing scenes in parallel batches", "Continuing each scene from the one before it", "Keeping every character's voice consistent",
    "Formatting headings, action and dialogue", "Checking headings, cast and length as scenes land"],
  rewrite_scene: ["Reading the scene and the scenes around it", "Reworking it as asked", "Keeping its heading and characters", "Checking the result"],
};
const clock = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

function Working({ r }: { r: WritingResult }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const p = r.progress ?? {};
  const steps = STEPS[r.kind];
  const step = steps[Math.floor((now - Date.parse(r.created_at)) / 4000) % steps.length];
  return (
    <div className="flex items-start gap-3 rounded-lg border border-sky-400/30 bg-sky-400/5 p-3" role="status" aria-live="polite" data-testid={`working-${r.kind}`}>
      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/20" />
        <span className="relative text-lg">✎</span>
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <p className="text-sm text-sky-200">{r.status === "queued" ? "Starting — waiting for a free writer…" : p.stage ?? "Working…"}</p>
        <p key={step} className="mt-0.5 animate-pulse text-white/55">{step}</p>
        {p.total ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-1.5 w-48 overflow-hidden rounded bg-white/10" aria-label="Progress">
              <span className="block h-full bg-sky-400 transition-all duration-700" style={{ width: `${Math.round(((p.done ?? 0) / p.total) * 100)}%` }} />
            </span>
            <span className="text-white/60">{p.done ?? 0} of {p.total} scenes written</span>
          </div>
        ) : null}
        <p className="mt-1 text-[11px] text-white/35">{clock(now - Date.parse(r.created_at))} elapsed · runs in the background — you can keep working or leave this page</p>
      </div>
    </div>
  );
}

function Status({ r }: { r: WritingResult }) {
  if (r.status === "queued" || r.status === "running") return <div data-testid={`writing-status-${r.kind}`}><Working r={r} /></div>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid={`writing-status-${r.kind}`}>
      <span className={`rounded-full border px-2 py-0.5 ${r.status === "succeeded" ? "border-emerald-400/60 text-emerald-300" : "border-red-400/60 text-red-300"}`}>
        {r.status === "succeeded" ? (r.source === "user" ? "Yours" : "Done") : "Failed"}
      </span>
      {r.test_output && <span className="rounded bg-amber-500/90 px-1.5 font-semibold text-black" title="Made by the labelled test writer — connect Claude for real writing">TEST OUTPUT</span>}
      {r.status === "succeeded" && r.source !== "user" && !r.test_output && r.provider && <span className="text-white/40">by {r.provider === "anthropic" ? "Claude" : r.provider}{r.model ? ` (${r.model})` : ""}</span>}
      {r.status === "succeeded" && r.source !== "user" && r.completed_at && <span className="text-white/35">{clock(Date.parse(r.completed_at) - Date.parse(r.created_at))}</span>}
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
type ProjectBrief = { title: string; logline?: string | null; synopsis?: string | null; genre?: string | null; tone?: string | null; setting?: string | null; time_period?: string | null; target_runtime_minutes?: number | null };
const blankStory = (p: ProjectBrief): StoryDraft => ({
  title_options: [p.title], logline: p.logline ?? "", synopsis: p.synopsis ?? "", themes: [], genre: p.genre ?? "", tone: p.tone ?? "", setting: p.setting ?? "", time_period: p.time_period ?? "",
  characters: [{ name: "", role: "protagonist", age: null, name_reasoning: "", description: "", want: "", need: "", arc: "" }],
  beats: [{ act: 1, title: "Opening", summary: "", approx_minute: 0 }, { act: 2, title: "Turning point", summary: "", approx_minute: Math.round((p.target_runtime_minutes ?? 10) / 2) }, { act: 3, title: "Ending", summary: "", approx_minute: Math.round((p.target_runtime_minutes ?? 10) * 0.9) }],
  assumptions: [],
});

/** Write the story yourself, or edit a proposal: saved as your story, which Outline and Script then use. */
function StoryEditor({ start, busy, onSave, onCancel }: { start: StoryDraft; busy: boolean; onSave: (s: StoryDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<StoryDraft>(start);
  const setC = (i: number, patch: Partial<StoryCharacter>) => setD({ ...d, characters: d.characters.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const setB = (i: number, patch: Partial<StoryBeat>) => setD({ ...d, beats: d.beats.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const names = d.characters.map((c) => c.name.trim()).filter(Boolean);
  const problems = [
    d.logline.trim().length < 10 && "a logline (10+ characters)",
    d.synopsis.trim().length < 50 && "a synopsis (50+ characters)",
    !names.length && "at least one named character",
    new Set(names.map((n) => n.toLowerCase())).size !== names.length && "different names for each character",
    d.beats.filter((x) => x.title.trim()).length < 3 && "three beats",
  ].filter(Boolean) as string[];
  const small = "rounded border border-aura-border bg-black px-2 py-1 text-xs";
  return (
    <div className="space-y-3 rounded-xl border border-aura-gold/40 bg-aura-panel p-4 text-sm" aria-label="Your story">
      <p className="text-xs text-white/60">Write it your way. When you save, this becomes the story the outline, the script and later developments use — character names stay exactly as you write them.</p>
      <label className="block text-xs text-white/50">Logline<textarea aria-label="Your logline" rows={2} value={d.logline} onChange={(e) => setD({ ...d, logline: e.target.value })} className={`${input} mt-1`} /></label>
      <label className="block text-xs text-white/50">Synopsis<textarea aria-label="Your synopsis" rows={5} value={d.synopsis} onChange={(e) => setD({ ...d, synopsis: e.target.value })} className={`${input} mt-1`} /></label>
      <div>
        <div className="flex items-center justify-between text-xs text-white/50">Characters
          <button onClick={() => setD({ ...d, characters: [...d.characters, { name: "", role: "supporting", age: null, name_reasoning: "", description: "", want: "", need: "", arc: "" }] })} className={small}>+ Character</button>
        </div>
        <ul className="mt-1 space-y-2">
          {d.characters.map((c, i) => (
            <li key={i} className="grid gap-1 rounded border border-aura-border p-2 md:grid-cols-[1fr_120px_70px_2fr_auto]">
              <input aria-label={`Character ${i + 1} name`} value={c.name} onChange={(e) => setC(i, { name: e.target.value })} placeholder="Name" className={small} />
              <select aria-label={`Character ${i + 1} role`} value={c.role} onChange={(e) => setC(i, { role: e.target.value as StoryCharacter["role"] })} className={small}>
                {["protagonist", "antagonist", "supporting", "minor"].map((x) => <option key={x}>{x}</option>)}
              </select>
              <input aria-label={`Character ${i + 1} age`} type="number" min={0} max={120} value={c.age ?? ""} onChange={(e) => setC(i, { age: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Age" className={small} />
              <input aria-label={`Character ${i + 1} description`} value={c.description} onChange={(e) => setC(i, { description: e.target.value })} placeholder="Who they are" className={small} />
              <button aria-label={`Remove character ${i + 1}`} onClick={() => setD({ ...d, characters: d.characters.filter((_, k) => k !== i) })} className="px-2 text-red-300">✕</button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-white/50">Beats
          <button onClick={() => setD({ ...d, beats: [...d.beats, { act: d.beats.at(-1)?.act ?? 1, title: "", summary: "", approx_minute: (d.beats.at(-1)?.approx_minute ?? 0) + 1 }] })} className={small}>+ Beat</button>
        </div>
        <ol className="mt-1 space-y-1">
          {d.beats.map((x, i) => (
            <li key={i} className="grid gap-1 md:grid-cols-[60px_70px_1fr_2fr_auto]">
              <input aria-label={`Beat ${i + 1} act`} type="number" min={1} max={5} value={x.act} onChange={(e) => setB(i, { act: Number(e.target.value) || 1 })} className={small} />
              <input aria-label={`Beat ${i + 1} minute`} type="number" min={0} value={x.approx_minute} onChange={(e) => setB(i, { approx_minute: Number(e.target.value) || 0 })} className={small} />
              <input aria-label={`Beat ${i + 1} title`} value={x.title} onChange={(e) => setB(i, { title: e.target.value })} placeholder="Beat" className={small} />
              <input aria-label={`Beat ${i + 1} summary`} value={x.summary} onChange={(e) => setB(i, { summary: e.target.value })} placeholder="What happens" className={small} />
              <button aria-label={`Remove beat ${i + 1}`} onClick={() => setD({ ...d, beats: d.beats.filter((_, k) => k !== i) })} className="px-2 text-red-300">✕</button>
            </li>
          ))}
        </ol>
      </div>
      {problems.length > 0 && <p className="text-xs text-amber-300">Still needed: {problems.join(", ")}.</p>}
      <div className="flex gap-2">
        <button disabled={busy || problems.length > 0} onClick={() => onSave({
          ...d, logline: d.logline.trim(), synopsis: d.synopsis.trim(),
          characters: d.characters.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim(), name_reasoning: c.name_reasoning || "Chosen by the writer." })),
          beats: d.beats.filter((x) => x.title.trim()).map((x) => ({ ...x, summary: x.summary || x.title })),
        })} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Save as my story</button>
        <button onClick={onCancel} className="rounded-md border border-aura-border px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}

export function StoryDevelopmentPanel({ w, canEdit, project, onApplied }: { w: W; canEdit: boolean; project: ProjectBrief; onApplied: () => void }) {
  const [req, setReq] = useState("");
  const r = w.latest("develop_story");
  const o = r?.status === "succeeded" ? r.output : null;
  const [pick, setPick] = useState<Set<string>>(new Set(["logline", "synopsis"]));
  const [title, setTitle] = useState<string | null>(null);
  const [editing, setEditing] = useState<StoryDraft | null>(null);
  useEffect(() => setTitle(null), [r?.id]);
  const current = w.currentStory;
  const isCurrent = !!r && r.id === w.currentStoryId;
  const decided = (current?.output?.characters ?? []) as { name: string }[];
  return (
    <section aria-label="Story Development" className="space-y-4">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <p className="text-sm text-white/60">AuraStage reads your Project Setup and proposes the story: title options, logline, synopsis, themes, characters (with why each name fits) and the beats across the acts. Nothing changes until you apply it — or write the story yourself.</p>
        {decided.length > 0 && (
          <p className="mt-2 text-xs text-white/50" data-testid="decided-names">Names already decided (kept by every new development): <span className="text-white/80">{decided.map((c) => c.name).join(", ")}</span>. Ask for new names in the box below if you want them changed.</p>
        )}
        <textarea aria-label="What should the story do?" rows={2} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Optional: e.g. make the antagonist sympathetic; end on a twist" className={`${input} mt-3`} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => w.request("develop_story", { request: req })} disabled={!canEdit || w.busy || r?.status === "queued" || r?.status === "running"}
            className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{o ? "Develop again" : "Develop the story"}</button>
          <button onClick={() => setEditing(current?.output ? { ...(current.output as StoryDraft) } : blankStory(project))} disabled={!canEdit || w.busy}
            className="rounded-md border border-aura-border px-4 py-2 text-sm disabled:opacity-40">{current ? "Edit the story myself" : "Write the story myself"}</button>
        </div>
      </div>
      {editing && <StoryEditor start={editing} busy={w.busy} onCancel={() => setEditing(null)} onSave={async (story) => { if (await w.saveStory(current?.id ?? null, story)) setEditing(null); }} />}
      {r && !editing && (
        <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Status r={r} />
            {o && (isCurrent
              ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300" data-testid="current-story">Current story — Outline and Script use it</span>
              : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200" data-testid="proposal-not-used">New proposal — not used yet{current ? ` (the current story has ${(current.output?.characters ?? []).map((c: { name: string }) => c.name).slice(0, 4).join(", ")})` : ""}</span>)}
          </div>
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
                <p className="mt-1 text-[11px] text-white/40">These names are used by the outline and the script, and become Casting's characters when the script is approved.</p>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/50">Beats</div>
                <ol aria-label="Story beats" className="mt-1 space-y-1 text-xs">
                  {(o.beats as any[]).map((b, i) => <li key={i}><span className="text-aura-gold">Act {b.act} · ~{b.approx_minute}′</span> <b>{b.title}</b> — <span className="text-white/70">{b.summary}</span></li>)}
                </ol>
              </div>
              {o.assumptions?.length > 0 && <p className="text-xs text-white/50">Assumed: {(o.assumptions as string[]).join(" · ")}</p>}
              <Checks checks={r.checks} />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={async () => { const fields = [...pick, ...(title ? ["title"] : [])]; if (await w.applyStory(r.id, fields, title ?? undefined)) onApplied(); }}
                  disabled={!canEdit || w.busy || (!pick.size && !title)} className="rounded-md border border-aura-gold/60 px-4 py-2 text-aura-gold disabled:opacity-40">
                  Apply selected to Project Setup
                </button>
                {!isCurrent && (
                  <button onClick={() => w.applyStory(r.id, [])} disabled={!canEdit || w.busy} className="rounded-md border border-aura-border px-4 py-2 disabled:opacity-40">
                    Use this story (keep Project Setup as it is)
                  </button>
                )}
                <button onClick={() => setEditing({ ...(o as StoryDraft) })} disabled={!canEdit || w.busy} className="rounded-md border border-aura-border px-4 py-2 disabled:opacity-40">Edit this story</button>
                {r.accepted?.fields && r.accepted.fields.length > 0 && <span className="text-xs text-emerald-300">Applied: {r.accepted.fields.join(", ")}</span>}
              </div>
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
  const dev = w.currentStory;
  const builtFrom = w.storyOf(done);
  const names = (x: typeof dev) => ((x?.output?.characters ?? []) as { name: string }[]).map((c) => c.name);
  const mismatch = !!done && !!dev && !!builtFrom && builtFrom.id !== dev.id && names(builtFrom).join("|") !== names(dev).join("|");
  const [scenes, setScenes] = useState<OutlineScene[]>([]);
  useEffect(() => setScenes(done?.output?.scenes ?? []), [done?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(scenes) !== JSON.stringify(done?.output?.scenes ?? []);
  const total = Math.round(scenes.reduce((a, s) => a + Number(s.est_minutes || 0), 0));
  const set = (i: number, patch: Partial<OutlineScene>) => setScenes(scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const a = [...scenes]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); setScenes(a.map((s, k) => ({ ...s, number: k + 1 }))); };
  return (
    <section aria-label="Scene outline" className="space-y-3">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <p className="text-sm text-white/60">A scene-by-scene outline {dev ? `from your current story (${names(dev).slice(0, 4).join(", ") || "no named characters yet"})` : "from your Project Setup"}, sized to the target runtime. Edit anything — your edits are saved as your own version and the script is written from it. You can also build it scene by scene yourself: add scenes with “+ Scene”.</p>
        <textarea aria-label="Outline request" rows={2} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Optional: e.g. open on the harbour; keep it under 25 scenes" className={`${input} mt-3`} />
        <button onClick={() => w.request("outline", { request: req, parent_id: dev?.id ?? null })} disabled={!canEdit || w.busy || r?.status === "queued" || r?.status === "running"}
          className="mt-2 rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{done ? "Build a new outline" : "Build the scene outline"}</button>
      </div>
      {r && r.id !== done?.id && <div className="rounded-xl border border-aura-border bg-aura-panel p-4"><Status r={r} /></div>}
      {!done && canEdit && (
        <button onClick={() => w.saveOutline(dev?.id ?? null, [{ number: 1, int_ext: "INT", location: "NEW PLACE", time_of_day: "DAY", purpose: "", beat: "", summary: "What happens.", characters: names(dev).slice(0, 2), est_minutes: 2 }])}
          disabled={w.busy} className="rounded-md border border-aura-border px-4 py-2 text-sm">Start an outline myself</button>
      )}
      {mismatch && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 px-4 py-3 text-sm text-amber-200" data-testid="outline-story-mismatch">
          <span className="min-w-0 flex-1">This outline was built from an earlier story ({names(builtFrom).slice(0, 4).join(", ")}). The current story's characters are {names(dev).slice(0, 4).join(", ")}.</span>
          <button onClick={() => w.request("outline", { request: req, parent_id: dev!.id })} disabled={!canEdit || w.busy} className="rounded border border-amber-400/60 px-3 py-1 text-xs">Rebuild from the current story</button>
        </div>
      )}
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
export function ScriptToolsPanel({ w, projectId, canEdit, sceneNumbers, currentVersionId, dirty, onOpened, initialScene = null }: {
  w: W; projectId: string; canEdit: boolean; sceneNumbers: number[]; currentVersionId: string | null; dirty: boolean; onOpened: () => void;
  /** Scene chosen elsewhere (Scene Breakdown → Rework). */
  initialScene?: number | null;
}) {
  const [n, setN] = useState<number>(initialScene ?? sceneNumbers[0] ?? 1);
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
