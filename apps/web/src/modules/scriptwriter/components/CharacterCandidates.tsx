// Character Extraction (SRS §5.2): speaking characters found in the script, with the evidence (line and scene counts),
// checked against the current story's characters so every page uses the same names. A character can be renamed
// everywhere in the script (cues, action, dialogue) — the editor gets the new text to save as a version — and opened
// in Casting & Characters, the canonical owner of Character identity (created from the approved script).
import Link from "next/link";
import { useState } from "react";
import { characterRename, scriptCastMatch, type ScriptAnalysis } from "@aurastage/engines";

export function CharacterCandidates({ analysis, projectId, storyNames, draft, canEdit, onRename }: {
  analysis: ScriptAnalysis; projectId: string; storyNames: string[]; draft: string; canEdit: boolean;
  /** New script text after a rename (not saved yet) and what changed. */
  onRename: (text: string, summary: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [to, setTo] = useState("");
  // Owner report 2026-10-03 ("so many character mismatch"): cues are matched the way scripts are written — full name,
  // first name, surname or a titled name — and roles (REPORTER, PRESIDING OFFICER) and group lines (ALL) are not
  // mismatches. The matching is scriptCastMatchEngine's (tested there).
  const m = scriptCastMatch.matchScriptCast(analysis.speaking_characters, storyNames.map((name) => ({ name })));
  const hasStory = storyNames.length > 0;
  const inStory = m.cues.filter((c) => c.kind === "story");
  const named = m.cues.filter((c) => c.kind === "named");
  const walkOn = m.cues.filter((c) => c.kind === "walk_on");
  const group = m.cues.filter((c) => c.kind === "group");
  const apply = (from: string) => {
    const target = to.trim();
    if (!target) return;
    const r = characterRename.renameCharacter(draft, from, target);
    onRename(r.text, `Renamed ${from} → ${target}: ${r.cues} cue${r.cues === 1 ? "" : "s"}, ${r.mentions} mention${r.mentions === 1 ? "" : "s"}. Save the version to keep it.`);
    setRenaming(null);
    setTo("");
  };
  const counts = (c: { lines: number; scenes: number }) => `${c.lines} ${c.lines === 1 ? "line" : "lines"} · ${c.scenes} ${c.scenes === 1 ? "scene" : "scenes"}`;
  const how = { full: "", first: " (cue is the first name)", surname: " (cue is the surname)" } as const;
  const actions = (name: string) => (
    <>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {canEdit && <button onClick={() => { setRenaming(name); setTo(""); }} className="text-aura-gold underline">Rename everywhere</button>}
        <Link href={`/projects/${projectId}/casting`} className="text-white/60 underline">Open in Casting →</Link>
      </div>
      {renaming === name && (
        <div className="mt-2 flex gap-2">
          <input aria-label={`New name for ${name}`} list={`story-names-${name}`} value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply(name)}
            placeholder="New name" className="min-w-0 flex-1 rounded border border-aura-border bg-black px-2 py-1 text-xs" />
          <datalist id={`story-names-${name}`}>{storyNames.map((n) => <option key={n} value={n} />)}</datalist>
          <button onClick={() => apply(name)} disabled={!to.trim()} className="rounded bg-aura-gold px-2 py-1 text-xs font-medium text-black disabled:opacity-40">Rename</button>
        </div>
      )}
    </>
  );
  const card = (c: (typeof m.cues)[number], note: React.ReactNode, tone: string) => (
    <li key={c.name} className="rounded-lg border border-aura-border bg-black/30 p-3" aria-label={`Character ${c.name}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aura-gold/15 font-display text-aura-gold">{c.name.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm">{c.name}</div>
          <div className="text-xs text-white/50">{counts(c)}</div>
        </div>
      </div>
      <p className={`mt-2 text-[11px] ${tone}`}>{note}</p>
      {actions(c.name)}
    </li>
  );
  const section = (title: string, hint: string, items: typeof m.cues, render: (c: (typeof m.cues)[number]) => React.ReactNode, label: string) => items.length > 0 && (
    <div className="border-t border-aura-border px-5 py-4 first:border-t-0">
      <h3 className="text-sm font-medium">{title} <span className="text-white/40">({items.length})</span></h3>
      <p className="mt-0.5 text-xs text-white/45">{hint}</p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={label}>{items.map(render)}</ul>
    </div>
  );
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="border-b border-aura-border px-5 py-3">
        <h2 className="font-display text-xl">Character Extraction</h2>
        <p className="text-sm text-white/50">
          Everyone who speaks in the script, checked against your current story. Casting & Characters turns them into full profiles when the script is approved.
        </p>
        {hasStory && m.cues.length > 0 && (
          <p className="mt-1 text-xs text-white/60" data-testid="cast-summary">
            <span className="text-emerald-300">{inStory.length} in your story</span>
            {named.length > 0 && <> · <span className="text-amber-300">{named.length} named in the script only</span></>}
            {walkOn.length > 0 && <> · {walkOn.length} walk-on part{walkOn.length === 1 ? "" : "s"}</>}
            {group.length > 0 && <> · {group.length} group line{group.length === 1 ? "" : "s"}</>}
          </p>
        )}
      </div>
      {m.cues.length === 0 ? (
        <p className="p-5 text-sm text-white/40">No speaking characters found yet.</p>
      ) : !hasStory ? (
        section("Speaking characters", "No story yet — every speaking character is listed.", m.cues, (c) => card(c, "No story yet", "text-white/40"), "Speaking characters")
      ) : (
        <>
          {section("In your story", "The script and the story agree on these people.", inStory,
            (c) => card(c, `✓ In your story as ${c.story_name}${c.how ? how[c.how] : ""}`, "text-emerald-300"), "Speaking characters")}
          {section("Named in the script, not in your story", "Not in your current story — add them to the story, rename them to a story character, or keep them as small named parts (Casting still makes them characters).",
            named, (c) => card(c, "! Not in your current story — rename or add them to the story", "text-amber-300"), "Named characters not in the story")}
          {section("Walk-on parts", "Small roles named by what they do. Nothing to fix — Casting makes them minor characters; rename one if it should be a story person.",
            walkOn, (c) => card(c, "Walk-on part", "text-white/50"), "Walk-on parts")}
          {section("Lines said by a group", "Several people speak at once (ALL, VOICES) — these are not characters.",
            group, (c) => card(c, "Group line", "text-white/50"), "Group lines")}
        </>
      )}
      {hasStory && m.silent.length > 0 && m.cues.length > 0 && (
        <p className="border-t border-aura-border px-5 py-3 text-xs text-white/50" data-testid="silent-story-characters">
          In your story but with no lines yet: <span className="text-white/80">{m.silent.join(", ")}</span>
        </p>
      )}
      {hasStory && m.not_people.length > 0 && (
        <p className="border-t border-aura-border px-5 py-3 text-xs text-white/50" data-testid="story-groups-places">
          Groups and places your story lists with its characters (not speaking parts): <span className="text-white/80">{m.not_people.join(", ")}</span>
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
