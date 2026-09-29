// engines/scene-dna/storyTimeCueEngine — story-driven aging (owner, 2026-09-29: "age per scene for flashbacks and time
// jumps"). Reads the script's own words and points at scenes that happen at another time, so the filmmaker can choose
// each character's age there in Scene DNA. It only reports what the text says, with the line as evidence; it never
// sets an age by itself.
import { StoryTimeCueInputSchema, type StoryTimeCueInput } from "./input.schema";
import { ENGINE_VERSION } from "./version";

export type StoryTimeCueKind = "flashback" | "back_to_present" | "time_jump" | "year" | "character_age";
export interface StoryTimeCue {
  kind: StoryTimeCueKind;
  /** The words in the script, exactly as written. */
  text: string;
  where: "heading" | "action";
  line: number | null;
  character_id?: string;
  /** For character_age: "10" from "AMARA (10)"; "young" / "old" from "YOUNG AMARA". */
  age?: string;
}
export interface SceneStoryTime { scene_id: string; number: number; cues: StoryTimeCue[]; other_time: boolean }
export interface StoryTimeCueOutput { scenes: SceneStoryTime[]; engine_version: string }

const NUM = "\\d+|a few|a couple of|several|many|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty";
const JUMP = new RegExp(`\\b(?:${NUM})\\s+(?:years?|months?|weeks?|decades?|days?)\\s+(?:earlier|later|ago|before|after|on)\\b`, "gi");
const FLASH = /\b(?:flash\s*back|flashback|dream sequence|memory)\b/gi;
const PRESENT = /\b(?:back to (?:the )?present(?: day)?|present day|end (?:of )?flash\s*back|return to present)\b/gi;
const YEAR = /\b(1[5-9]\d\d|20\d\d)s?\b/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function storyTimeCueEngine(raw: StoryTimeCueInput): StoryTimeCueOutput {
  const input = StoryTimeCueInputSchema.parse(raw);
  const names = input.characters
    .map((c) => ({ id: c.id, name: c.name.trim(), age: c.age ?? null }))
    .filter((c) => c.name.length >= 2)
    .sort((a, b) => b.name.length - a.name.length);
  const scenes = input.scenes.map((s) => {
    const cues: StoryTimeCue[] = [];
    const seen = new Set<string>();
    const add = (c: StoryTimeCue) => {
      const k = `${c.kind}|${c.text.toLowerCase()}|${c.character_id ?? ""}`;
      if (!seen.has(k)) { seen.add(k); cues.push(c); }
    };
    const scan = (text: string, where: "heading" | "action", line: number | null) => {
      for (const m of text.matchAll(FLASH)) add({ kind: "flashback", text: m[0], where, line });
      for (const m of text.matchAll(PRESENT)) add({ kind: "back_to_present", text: m[0], where, line });
      for (const m of text.matchAll(JUMP)) add({ kind: "time_jump", text: m[0], where, line });
      // Years only from headings and super-titles, where they date the scene (not "a 1970s car" in the action).
      if (where === "heading" || /^\s*(?:super|title|caption|card)\s*:/i.test(text)) for (const m of text.matchAll(YEAR)) add({ kind: "year", text: m[0], where, line });
      for (const c of names) {
        const n = esc(c.name);
        const young = new RegExp(`\\b(young(?:er)?|little|teenage|teen|baby|child|old(?:er)?|elderly|aged)\\s+${n}\\b`, "gi");
        for (const m of text.matchAll(young)) add({ kind: "character_age", text: m[0], where, line, character_id: c.id, age: m[1].toLowerCase() });
        // "AMARA (10)" when her profile says 32 — not the usual "AMARA (32)" introduction.
        const paren = new RegExp(`\\b${n}\\s*\\((?:age\\s*)?(\\d{1,3})[^)]{0,12}\\)`, "gi");
        const profile = Number((c.age ?? "").match(/\d{1,3}/)?.[0] ?? NaN);
        for (const m of text.matchAll(paren)) {
          if (!Number.isFinite(profile) || Math.abs(Number(m[1]) - profile) <= 3) continue;
          add({ kind: "character_age", text: m[0], where, line, character_id: c.id, age: m[0].slice(m[0].indexOf("(") + 1, -1).trim() });
        }
      }
    };
    scan(s.heading, "heading", null);
    for (const a of s.action) scan(a.text, "action", a.line);
    const other_time = cues.some((c) => c.kind !== "back_to_present");
    return { scene_id: s.id, number: s.number, cues, other_time };
  });
  return { scenes, engine_version: ENGINE_VERSION };
}
