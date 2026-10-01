"use client";
// Beat board (BUILD_PLAN §8 item 13): the current story's beats as cards, one column per act. Edit a card, move it up or
// down, or to the next or previous act; add or remove beats. "Save beat board" saves it as your story — the outline and
// the script use it from then on (the same save as editing the story yourself).
import { useEffect, useState } from "react";
import type { StoryBeat, StoryDraft } from "../api/writingApi";

const field = "w-full rounded border border-aura-border bg-black/40 px-2 py-1 text-xs outline-none focus:border-aura-gold";

export function BeatBoard({ story, busy, canEdit, onSave }: { story: StoryDraft; busy: boolean; canEdit: boolean; onSave: (s: StoryDraft) => void }) {
  const [beats, setBeats] = useState<StoryBeat[]>(story.beats);
  useEffect(() => setBeats(story.beats), [story]);
  const acts = Math.max(3, ...beats.map((b) => b.act));
  const dirty = JSON.stringify(beats) !== JSON.stringify(story.beats);
  const order = (list: StoryBeat[]) => [...list].sort((a, b) => a.act - b.act || a.approx_minute - b.approx_minute);
  const set = (i: number, patch: Partial<StoryBeat>) => setBeats(beats.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const swap = (i: number, d: number) => {
    const col = beats.map((b, k) => ({ b, k })).filter((x) => x.b.act === beats[i].act);
    const pos = col.findIndex((x) => x.k === i), other = col[pos + d];
    if (!other) return;
    const a = [...beats];
    const [m1, m2] = [a[i].approx_minute, a[other.k].approx_minute];
    a[i] = { ...a[i], approx_minute: m2 }; a[other.k] = { ...a[other.k], approx_minute: m1 };
    [a[i], a[other.k]] = [a[other.k], a[i]];
    setBeats(a);
  };
  const thread = (t: string) => (/\(B-story\)/.test(t) ? "border-l-sky-400" : /'s plan\)/.test(t) ? "border-l-rose-400" : "border-l-aura-gold");
  return (
    <section aria-label="Beat board" className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-xs uppercase tracking-widest text-aura-gold">Beat board</h3>
        <span className="text-[11px] text-white/40">Gold: main story · blue: B-story · red: the antagonist&apos;s plan</span>
        {dirty && <button onClick={() => setBeats(story.beats)} className="rounded border border-aura-border px-2 py-1 text-xs">Discard</button>}
        <button disabled={!canEdit || busy || !dirty || beats.length < 3} onClick={() => onSave({ ...story, beats: order(beats) })}
          className="rounded bg-aura-gold px-3 py-1 text-xs font-medium text-black disabled:opacity-40">Save beat board</button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${acts}, minmax(0, 1fr))` }}>
        {Array.from({ length: acts }, (_, a) => a + 1).map((act) => (
          <div key={act} role="list" aria-label={`Act ${act}`} className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-white/50">Act {act}</div>
            {beats.map((b, i) => ({ b, i })).filter((x) => x.b.act === act).sort((x, y) => x.b.approx_minute - y.b.approx_minute).map(({ b, i }) => (
              <div key={i} role="listitem" aria-label={`Beat ${b.title}`} className={`space-y-1 rounded border border-aura-border border-l-4 ${thread(b.title)} bg-black/30 p-2`}>
                <input aria-label="Beat title" value={b.title} onChange={(e) => set(i, { title: e.target.value.slice(0, 120) })} className={field} />
                <textarea aria-label="Beat summary" rows={3} value={b.summary} onChange={(e) => set(i, { summary: e.target.value.slice(0, 800) })} className={field} />
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-white/50">
                  <label className="flex items-center gap-1">min <input aria-label="Beat minute" type="number" min={0} max={600} value={b.approx_minute} onChange={(e) => set(i, { approx_minute: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} className="w-14 rounded border border-aura-border bg-black/40 px-1" /></label>
                  <button aria-label={`Move ${b.title} up`} onClick={() => swap(i, -1)} className="rounded border border-aura-border px-1">↑</button>
                  <button aria-label={`Move ${b.title} down`} onClick={() => swap(i, 1)} className="rounded border border-aura-border px-1">↓</button>
                  <button aria-label={`Move ${b.title} to the previous act`} disabled={act === 1} onClick={() => set(i, { act: act - 1 })} className="rounded border border-aura-border px-1 disabled:opacity-30">←</button>
                  <button aria-label={`Move ${b.title} to the next act`} disabled={act >= 5} onClick={() => set(i, { act: act + 1 })} className="rounded border border-aura-border px-1 disabled:opacity-30">→</button>
                  <button aria-label={`Remove ${b.title}`} onClick={() => setBeats(beats.filter((_, k) => k !== i))} className="ml-auto text-red-300">✕</button>
                </div>
              </div>
            ))}
            <button onClick={() => setBeats([...beats, { act, title: "New beat", summary: "What happens.", approx_minute: Math.max(0, ...beats.filter((x) => x.act === act).map((x) => x.approx_minute + 1)) }])}
              className="w-full rounded border border-dashed border-aura-border px-2 py-1 text-xs text-white/50">+ Beat in act {act}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
