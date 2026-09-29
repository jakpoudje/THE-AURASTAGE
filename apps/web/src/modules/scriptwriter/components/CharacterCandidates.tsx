// Character Extraction (SRS §5.2): speaking characters found in the script, with the evidence (line and scene counts),
// checked against the current story's characters so every page uses the same names. A character can be renamed
// everywhere in the script (cues, action, dialogue) — the editor gets the new text to save as a version — and opened
// in Casting & Characters, the canonical owner of Character identity (created from the approved script).
import Link from "next/link";
import { useState } from "react";
import { characterRename, type ScriptAnalysis } from "@aurastage/engines";

const norm = (s: string) => s.trim().toUpperCase();

export function CharacterCandidates({ analysis, projectId, storyNames, draft, canEdit, onRename }: {
  analysis: ScriptAnalysis; projectId: string; storyNames: string[]; draft: string; canEdit: boolean;
  /** New script text after a rename (not saved yet) and what changed. */
  onRename: (text: string, summary: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [to, setTo] = useState("");
  // A cue is usually the first name in capitals; a story name matches when its full name or first name is the cue.
  const storyFor = (cue: string) => storyNames.find((n) => norm(n) === norm(cue) || norm(n.split(/\s+/)[0]) === norm(cue)) ?? null;
  const spoken = new Set(analysis.speaking_characters.map((c) => norm(c.name)));
  const silent = storyNames.filter((n) => !spoken.has(norm(n)) && !spoken.has(norm(n.split(/\s+/)[0])));
  const apply = (from: string) => {
    const target = to.trim();
    if (!target) return;
    const r = characterRename.renameCharacter(draft, from, target);
    onRename(r.text, `Renamed ${from} → ${target}: ${r.cues} cue${r.cues === 1 ? "" : "s"}, ${r.mentions} mention${r.mentions === 1 ? "" : "s"}. Save the version to keep it.`);
    setRenaming(null);
    setTo("");
  };
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="border-b border-aura-border px-5 py-3">
        <h2 className="font-display text-xl">Character Extraction</h2>
        <p className="text-sm text-white/50">
          Everyone who speaks in the script, checked against your current story. Casting & Characters turns them into full profiles when the script is approved.
        </p>
      </div>
      {analysis.speaking_characters.length === 0 ? (
        <p className="p-5 text-sm text-white/40">No speaking characters found yet.</p>
      ) : (
        <ul className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Speaking characters">
          {analysis.speaking_characters.map((c) => {
            const story = storyFor(c.name);
            return (
              <li key={c.name} className="rounded-lg border border-aura-border bg-black/30 p-3" aria-label={`Character ${c.name}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aura-gold/15 font-display text-aura-gold">{c.name.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{c.name}</div>
                    <div className="text-xs text-white/50">
                      {c.lines} {c.lines === 1 ? "line" : "lines"} · {c.scenes} {c.scenes === 1 ? "scene" : "scenes"}
                    </div>
                  </div>
                </div>
                <p className={`mt-2 text-[11px] ${story ? "text-emerald-300" : storyNames.length ? "text-amber-300" : "text-white/40"}`}>
                  {story ? `✓ In your story as ${story}` : storyNames.length ? "! Not in your current story — rename or add them to the story" : "No story yet"}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {canEdit && <button onClick={() => { setRenaming(c.name); setTo(""); }} className="text-aura-gold underline">Rename everywhere</button>}
                  <Link href={`/projects/${projectId}/casting`} className="text-white/60 underline">Open in Casting →</Link>
                </div>
                {renaming === c.name && (
                  <div className="mt-2 flex gap-2">
                    <input aria-label={`New name for ${c.name}`} list={`story-names-${c.name}`} value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply(c.name)}
                      placeholder="New name" className="min-w-0 flex-1 rounded border border-aura-border bg-black px-2 py-1 text-xs" />
                    <datalist id={`story-names-${c.name}`}>{storyNames.map((n) => <option key={n} value={n} />)}</datalist>
                    <button onClick={() => apply(c.name)} disabled={!to.trim()} className="rounded bg-aura-gold px-2 py-1 text-xs font-medium text-black disabled:opacity-40">Rename</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {silent.length > 0 && analysis.speaking_characters.length > 0 && (
        <p className="border-t border-aura-border px-5 py-3 text-xs text-white/50" data-testid="silent-story-characters">
          In your story but with no lines yet: <span className="text-white/80">{silent.join(", ")}</span>
        </p>
      )}
      {analysis.locations.length > 0 && (
        <div className="border-t border-aura-border px-5 py-3">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-white/40">Locations</h3>
          <div className="flex flex-wrap gap-2">
            {analysis.locations.map((l) => (
              <span key={l.name} className="rounded-full border border-aura-border px-3 py-1 text-xs text-white/70">
                {l.name} · {l.scenes}
              </span>
            ))}
          </div>
          <Link href={`/projects/${projectId}/world`} className="mt-2 inline-block text-xs text-aura-gold underline">Describe places and props in Locations & Props →</Link>
        </div>
      )}
    </div>
  );
}
