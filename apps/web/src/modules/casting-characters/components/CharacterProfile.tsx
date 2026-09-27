"use client";

// Character Profile (UI_REFERENCE §4 centre). Casting is the canonical owner of
// identity, so edits here are the only place a character's profile changes.
// Tabs that need image/voice generation are listed but marked Soon.

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  Character,
  CharacterAlias,
  CharacterAppearance,
  CharacterRelationship,
  CharacterRole,
  SaveWardrobeLookInput,
  SetRelationshipInput,
  UpdateCharacterInput,
  WardrobeLook,
} from "@aurastage/contracts";
import { RolePill } from "./RolePill";
import { RelationshipsTab } from "./RelationshipsTab";
import { WardrobeTab } from "./WardrobeTab";

type Tab = "profile" | "personality" | "relationships" | "wardrobe" | "scenes" | "names";
const TABS: { key: Tab | string; label: string; soon?: boolean }[] = [
  { key: "profile", label: "Profile" },
  { key: "personality", label: "Personality & Backstory" },
  { key: "relationships", label: "Relationships" },
  { key: "wardrobe", label: "Wardrobe" },
  { key: "scenes", label: "Scenes & Continuity" },
  { key: "names", label: "Names & Merges" },
  { key: "visual", label: "Appearance & Visual DNA", soon: true },
  { key: "voice", label: "Voice DNA", soon: true },
];
const ROLES: CharacterRole[] = ["lead", "supporting", "minor", "extra"];
const PROFILE_FIELDS = ["name", "age", "gender", "nationality", "occupation", "description"] as const;
const STORY_FIELDS = ["personality", "backstory", "motivation", "fears", "strengths", "weaknesses", "arc"] as const;
type Field = (typeof PROFILE_FIELDS)[number] | (typeof STORY_FIELDS)[number];
const LABELS: Record<Field, string> = {
  name: "Name", age: "Age", gender: "Gender", nationality: "Nationality", occupation: "Occupation", description: "Description",
  personality: "Personality", backstory: "Background", motivation: "Motivation", fears: "Fears", strengths: "Strengths",
  weaknesses: "Weaknesses", arc: "Character arc (by act)",
};

const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

export function CharacterProfile({
  character,
  characters,
  aliases,
  appearances,
  projectId,
  busy,
  onSave,
  onAddAlias,
  onMerge,
  onUnmerge,
  relationships,
  looks,
  onSaveRelationship,
  onDeleteRelationship,
  onSaveLook,
  onDeleteLook,
}: {
  character: Character;
  characters: Character[];
  aliases: CharacterAlias[];
  appearances: CharacterAppearance[];
  projectId: string;
  busy: string | null;
  onSave: (input: UpdateCharacterInput) => void;
  onAddAlias: (alias: string) => void;
  onMerge: (sourceId: string) => void;
  onUnmerge: (id: string) => void;
  relationships: CharacterRelationship[];
  looks: WardrobeLook[];
  onSaveRelationship: (input: SetRelationshipInput) => void;
  onDeleteRelationship: (id: string) => void;
  onSaveLook: (input: SaveWardrobeLookInput) => void;
  onDeleteLook: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const initial = useMemo(() => {
    const f = {} as Record<Field, string>;
    for (const k of [...PROFILE_FIELDS, ...STORY_FIELDS]) f[k] = (character[k] as string | null | undefined) ?? "";
    return f;
  }, [character]);
  const [form, setForm] = useState(initial);
  const [role, setRole] = useState(character.role);
  const [newAlias, setNewAlias] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");

  const changed = (Object.keys(form) as Field[]).filter((k) => form[k].trim() !== initial[k].trim());
  const dirty = changed.length > 0 || role !== character.role;
  const save = () => {
    const patch: Record<string, unknown> = {};
    for (const k of changed) patch[k] = k === "name" ? form[k].trim() : form[k].trim() || null;
    if (role !== character.role) patch.role = role;
    onSave(patch as UpdateCharacterInput);
  };

  const mine = appearances.filter((a) => a.character_id === character.id);
  const myAliases = aliases.filter((a) => a.character_id === character.id && a.source !== "name");
  const mergedIntoMe = characters.filter((c) => c.merged_into === character.id);
  const mergeOptions = characters.filter((c) => c.id !== character.id && !c.merged_into);

  const field = (k: Field, multiline = false) => (
    <label key={k} className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/50">{LABELS[k]}</span>
      {multiline ? (
        <textarea rows={3} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} />
      ) : (
        <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={input} />
      )}
    </label>
  );

  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="flex flex-wrap items-center gap-4 border-b border-aura-border p-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-aura-gold/15 font-display text-3xl text-aura-gold">
          {character.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl">{character.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
            <RolePill role={character.role} />
            {character.kind === "group" && <span>Group</span>}
            {character.age && <span>Age {character.age}</span>}
            {character.occupation && <span>· {character.occupation}</span>}
            <span>· {character.status === "approved" ? "Approved" : "Draft"}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!dirty || busy !== null}
            className="rounded-md border border-aura-gold/60 px-4 py-1.5 text-sm text-aura-gold disabled:opacity-40"
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => onSave({ status: character.status === "approved" ? "draft" : "approved" })}
            disabled={dirty || busy !== null}
            title={dirty ? "Save your changes first" : undefined}
            className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
          >
            {character.status === "approved" ? "Reopen for edits" : "Approve character"}
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-x-1 border-b border-aura-border px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            disabled={t.soon}
            onClick={() => setTab(t.key as Tab)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm ${
              tab === t.key ? "border-aura-gold text-aura-gold" : "border-transparent text-white/60"
            } disabled:cursor-not-allowed disabled:text-white/25`}
            title={t.soon ? "Arrives with Visual Generation and Audio Studio" : undefined}
          >
            {t.label}
            {t.soon && <span className="ml-1 text-[9px] uppercase">Soon</span>}
          </button>
        ))}
      </nav>

      <div className="p-5">
        {tab === "profile" && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {field("name")}
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/50">Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as CharacterRole)} className={input}>
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-aura-panel capitalize">
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              {field("age")}
              {field("gender")}
              {field("nationality")}
              {field("occupation")}
            </div>
            {field("description", true)}
          </div>
        )}

        {tab === "personality" && <div className="grid gap-4 md:grid-cols-2">{STORY_FIELDS.map((k) => field(k, true))}</div>}

        {tab === "relationships" && (
          <RelationshipsTab
            character={character}
            characters={characters}
            relationships={relationships}
            appearances={appearances}
            busy={busy !== null}
            onSave={onSaveRelationship}
            onDelete={onDeleteRelationship}
          />
        )}

        {tab === "wardrobe" && (
          <WardrobeTab character={character} looks={looks} busy={busy !== null} onSave={onSaveLook} onDelete={onDeleteLook} />
        )}

        {tab === "scenes" && (
          <div>
            {mine.length === 0 ? (
              <p className="text-sm text-white/50">This character isn't in any scene of the approved script.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="py-2">Scene</th>
                    <th className="py-2">Presence</th>
                    <th className="py-2">Lines</th>
                    <th className="py-2">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((a) => (
                    <tr key={a.id} className="border-t border-aura-border align-top">
                      <td className="py-2">
                        <Link href={`/projects/${projectId}/scriptwriter`} className="text-aura-gold hover:underline">
                          {a.scene_number}
                        </Link>
                      </td>
                      <td className="py-2 text-white/70">{a.voice_only ? "Voice only" : a.speaking ? "On screen, speaks" : "On screen"}</td>
                      <td className="py-2 text-white/70">{a.line_count}</td>
                      <td className="py-2 text-xs text-white/50">
                        {a.evidence.slice(0, 2).map((e, i) => (
                          <div key={i}>
                            Line {e.line}: {e.type === "cue" ? "speaks" : e.type === "introduction" ? "introduced" : "mentioned"} — “{e.text.slice(0, 60)}”
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "names" && (
          <div className="space-y-6">
            <section>
              <h3 className="text-xs uppercase tracking-widest text-white/50">Other names in the script</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {myAliases.length === 0 && <span className="text-sm text-white/40">None yet.</span>}
                {myAliases.map((a) => (
                  <span key={a.id} className="rounded-full border border-aura-border px-3 py-1 text-xs">
                    {a.alias}
                  </span>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newAlias.trim()) onAddAlias(newAlias.trim());
                  setNewAlias("");
                }}
                className="mt-3 flex gap-2"
              >
                <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="e.g. Mr. Okafor" className={input} maxLength={120} />
                <button disabled={busy !== null || !newAlias.trim()} className="shrink-0 rounded-md border border-aura-border px-3 text-sm disabled:opacity-40">
                  Add name
                </button>
              </form>
            </section>
            <section>
              <h3 className="text-xs uppercase tracking-widest text-white/50">Merge a duplicate into {character.name}</h3>
              <p className="mt-1 text-xs text-white/40">Use this when the same person was found twice. You can undo it.</p>
              <div className="mt-2 flex gap-2">
                <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className={input}>
                  <option value="" className="bg-aura-panel">
                    Choose a character…
                  </option>
                  {mergeOptions.map((c) => (
                    <option key={c.id} value={c.id} className="bg-aura-panel">
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!mergeFrom || busy !== null}
                  onClick={() => {
                    const src = characters.find((c) => c.id === mergeFrom);
                    if (src && window.confirm(`Merge "${src.name}" into "${character.name}"?`)) {
                      onMerge(mergeFrom);
                      setMergeFrom("");
                    }
                  }}
                  className="shrink-0 rounded-md border border-aura-gold/60 px-3 text-sm text-aura-gold disabled:opacity-40"
                >
                  Merge
                </button>
              </div>
              {mergedIntoMe.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {mergedIntoMe.map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-md bg-black/30 px-3 py-1.5">
                      <span className="text-white/70">“{c.name}” merged into this character</span>
                      <button onClick={() => onUnmerge(c.id)} disabled={busy !== null} className="text-xs text-aura-gold hover:underline">
                        Undo
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
