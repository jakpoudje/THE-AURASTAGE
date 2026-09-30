// engines/character/characterDuplicateEngine
// Owner report 2026-09-30: "I sometimes have characters named twice". Finds pairs of active characters that are likely
// the same person, with a plain reason, and which one to keep (the one with the fuller name / more scenes / approved).
// It never merges: Casting shows the pair and the person merges or says "not the same" (kept in distinct_from).
// Never infers identity from anything but the names the script uses (no appearance, culture or gender guesses).
import { z } from "zod";
import { normalizeCharacterName } from "@aurastage/contracts";
import { ENGINE_VERSION } from "./version";

export const CharacterDuplicateInputSchema = z.object({
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    scene_count: z.number().int().nonnegative().default(0),
    approved: z.boolean().default(false),
    /** Ids a person already said are a different character. */
    distinct_from: z.array(z.string()).default([]),
  })).max(500),
});
export type CharacterDuplicateInput = z.input<typeof CharacterDuplicateInputSchema>;
export interface DuplicatePair { keep_id: string; merge_id: string; keep_name: string; merge_name: string; reason: string; confidence: "high" | "medium" }
export interface CharacterDuplicateOutput { pairs: DuplicatePair[]; engine_version: string }

/** Words that describe a role, not a name ("DETECTIVE RAMOS" is RAMOS). */
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "DOCTOR", "PROF", "PROFESSOR", "DETECTIVE", "DET", "INSPECTOR", "OFFICER", "SERGEANT", "SGT",
  "CAPTAIN", "CAPT", "CHIEF", "AGENT", "LIEUTENANT", "LT", "COLONEL", "GENERAL", "SIR", "LADY", "LORD", "AUNT", "AUNTIE", "UNCLE", "MAMA", "PAPA",
  "FATHER", "MOTHER", "BROTHER", "SISTER", "PASTOR", "REVEREND", "IMAM", "ALHAJI", "ALHAJA", "CHIEFTAIN", "ODOGWU", "MADAM", "MADAME", "JUDGE", "NURSE", "COACH"]);
/** Script extensions that are never part of a name. */
const EXTENSIONS = /\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONTINUED|PRE-?LAP|FILTERED|ON PHONE|INTO PHONE)\)\s*/gi;

const tokens = (name: string) => normalizeCharacterName(name.replace(EXTENSIONS, " ")).split(/\s+/).filter(Boolean);
const core = (name: string) => tokens(name).filter((t) => !TITLES.has(t.replace(/\./g, "")));

function oneEdit(a: string, b: string) {
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function characterDuplicateEngine(raw: unknown): CharacterDuplicateOutput {
  const { characters } = CharacterDuplicateInputSchema.parse(raw);
  const people = characters.map((c) => ({ ...c, core: core(c.name), all: [c.name, ...c.aliases].map((n) => core(n).join(" ")).filter(Boolean) }));
  // How many characters use each single name word, so "AMARA" is only matched to "AMARA BELLO" when no one else is an AMARA.
  const wordUse = new Map<string, number>();
  for (const p of people) for (const w of new Set(p.core)) wordUse.set(w, (wordUse.get(w) ?? 0) + 1);

  const pairs: DuplicatePair[] = [];
  for (let x = 0; x < people.length; x++) for (let y = x + 1; y < people.length; y++) {
    const a = people[x], b = people[y];
    if (a.distinct_from.includes(b.id) || b.distinct_from.includes(a.id) || !a.core.length || !b.core.length) continue;
    let reason: string | null = null, confidence: DuplicatePair["confidence"] = "medium";
    const ak = a.core.join(" "), bk = b.core.join(" ");
    if (ak === bk || a.all.some((n) => b.all.includes(n))) {
      reason = ak === bk && normalizeCharacterName(a.name) !== normalizeCharacterName(b.name) ? `“${a.name}” and “${b.name}” are the same name with a title or script note` : "They share a name or alias";
      confidence = "high";
    } else {
      const [short, long] = a.core.length <= b.core.length ? [a, b] : [b, a];
      if (short.core.length === 1 && long.core.length >= 2 && (long.core[0] === short.core[0] || long.core[long.core.length - 1] === short.core[0]) && wordUse.get(short.core[0]) === 2) {
        reason = `“${short.name}” looks like ${long.core[0] === short.core[0] ? "the first" : "the last"} name of “${long.name}”, and no one else in the cast is called that`;
      } else if (a.core.length === b.core.length && a.core.every((w, i) => w === b.core[i] || oneEdit(w, b.core[i])) && a.core.some((w, i) => w !== b.core[i])) {
        reason = `“${a.name}” and “${b.name}” differ by one letter — possibly a typo`;
      }
    }
    if (!reason) continue;
    // Keep the fuller record: approved first, then more scenes, then the longer name.
    const score = (p: typeof a) => (p.approved ? 1e6 : 0) + p.scene_count * 100 + p.core.length * 10 + p.name.length / 100;
    const [keep, drop] = score(a) >= score(b) ? [a, b] : [b, a];
    pairs.push({ keep_id: keep.id, merge_id: drop.id, keep_name: keep.name, merge_name: drop.name, reason, confidence });
  }
  pairs.sort((p, q) => (p.confidence === q.confidence ? p.keep_name.localeCompare(q.keep_name) : p.confidence === "high" ? -1 : 1));
  return { pairs, engine_version: ENGINE_VERSION };
}
