// engines/character/pronunciationEngine
// Pronunciation guide (BUILD_PLAN §8 item 12). For each name, a sound-it-out spelling ("Adebayo" → "ah-deh-bah-yoh")
// that the voices read instead of the written name, so a built-in or provider voice doesn't anglicise it. Names an
// English voice already reads well (common English names, titles) are left alone. Vowels are read as in most
// languages written in the Latin alphabet (a = ah, e = eh, i = ee, o = oh, u = oo); stress and tone are NOT guessed —
// the guide says so, and the writer can correct it. Never inferred: who the person is; only how the letters sound.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const PronunciationInputSchema = z.object({
  name: z.string().min(1).max(200),
  /** The character's languages and accent as Casting holds them (they decide which spelling rules apply). */
  languages: z.string().max(200).nullable().default(null),
  accent: z.string().max(120).nullable().default(null),
});
export type PronunciationInput = z.input<typeof PronunciationInputSchema>;
export interface PronunciationOutput { pronunciation: string | null; why: string; engine_version: string }

/** Read well by English voices as written. */
const ENGLISH = new Set(`mr mrs ms miss dr sir madam officer detective inspector sergeant captain chief doctor nurse professor judge mama papa
john james michael david robert william richard thomas charles daniel matthew mark paul peter george edward henry jack harry oliver
samuel joseph benjamin andrew joshua ryan kevin brian jason eric adam simon stephen steven tony anthony chris christopher alex alexander
mary elizabeth sarah sara jane emily emma anna anne grace rose kate katherine catherine laura lucy amy alice helen ruth rachel rebecca
hannah jessica jennifer linda susan karen lisa nancy julia sophie charlotte victoria olivia chloe ella mia lily ruby holly claire
smith jones brown taylor wilson johnson williams davies evans thomas roberts walker wright robinson thompson white hughes edwards green
hall wood harris lewis martin jackson clarke clark turner hill scott cooper morris ward moore king watson baker young allen carter
bell ramos garcia lopez`.split(/\s+/));
const AFRICAN = /yoruba|igbo|hausa|nigeria|ghana|twi|akan|ewe|ga\b|swahili|kenya|tanzania|zulu|xhosa|south africa|wolof|senegal|amharic|ethiopia|lingala|congo|shona|zimbabwe|pidgin/i;
const ONSETS = ["gb", "kp", "ch", "sh", "ny", "ng", "ts", "dz", "th", "ph", "zh", "kw", "gw", "mb", "nd", "nj"];
const VOWEL: Record<string, string> = { a: "ah", e: "eh", i: "ee", o: "oh", u: "oo", y: "ee" };
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Consonant(s) + vowel syllables; a trailing consonant (or n/m before a consonant) closes the syllable. */
function syllables(word: string): string[] {
  const w = strip(word).replace(/[^a-z]/g, "");
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    let onset = "";
    const isV = (k: number) => !!VOWEL[w[k]] && !(w[k] === "y" && k + 1 < w.length && "aeiou".includes(w[k + 1]));
    while (i < w.length && !isV(i)) {
      const two = w.slice(i, i + 2);
      if (ONSETS.includes(two)) { onset += two; i += 2; } else { onset += w[i]; i += 1; }
    }
    if (i >= w.length) { if (out.length) out[out.length - 1] += onset; else out.push(onset); break; }
    let v = VOWEL[w[i]]; i += 1;
    // A doubled vowel is one long vowel ("aa", "ee", "oo").
    if (i < w.length && w[i] === w[i - 1]) i += 1;
    // n/m closing a syllable before another consonant ("Ngozi" keeps "ng" as onset; "Kofi" doesn't close).
    let coda = "";
    if (i + 1 < w.length && (w[i] === "n" || w[i] === "m") && !isV(i + 1) && !ONSETS.includes(w.slice(i, i + 2))) { coda = w[i]; i += 1; }
    out.push(onset + v + coda);
  }
  return out;
}

export function pronunciationEngine(raw: PronunciationInput): PronunciationOutput {
  const i = PronunciationInputSchema.parse(raw);
  const words = i.name.trim().split(/\s+/);
  const ctx = `${i.languages ?? ""} ${i.accent ?? ""}`;
  const african = AFRICAN.test(ctx);
  let changed = 0;
  const spoken = words.map((w) => {
    const plain = strip(w).replace(/[^a-z]/g, "");
    if (!plain || ENGLISH.has(plain) || plain.length < 3) return w;
    // Without a language that reads vowels this way, only respell names that don't look English (vowel-final, or
    // letter pairs English doesn't start syllables with).
    const foreignLooking = /[aiou]$/.test(plain) || /^(gb|kp|ng|ny|mb|nd|ts|dz)|[aeiou](gb|kp|ny)/.test(plain) || /[^\x00-\x7F]/.test(w);
    if (!african && !foreignLooking) return w;
    changed += 1;
    return syllables(w).join("-");
  });
  if (!changed) return { pronunciation: null, why: "An English voice reads this name as written.", engine_version: ENGINE_VERSION };
  return {
    pronunciation: spoken.join(" ").slice(0, 200),
    why: `Sounded out syllable by syllable (a = ah, e = eh, i = ee, o = oh, u = oo)${african ? ` for ${i.languages ?? i.accent}` : ""}. Stress and tone aren't marked — correct it if it's said differently.`,
    engine_version: ENGINE_VERSION,
  };
}

/**
 * The words a voice speaks for a line: every character name written in it is replaced by its pronunciation (the whole
 * name, then each part of it on its own — "Adebayo" alone when only the first name is used). The script is unchanged.
 */
export function sayNames(text: string, names: { name: string; pronunciation: string | null }[]): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pairs: [string, string][] = [];
  for (const n of names) {
    const say = n.pronunciation?.trim();
    if (!say) continue;
    pairs.push([n.name.trim(), say]);
    const w = n.name.trim().split(/\s+/), s = say.split(/\s+/);
    if (w.length > 1 && w.length === s.length) w.forEach((x, k) => { if (x.length > 2 && x.toLowerCase() !== s[k]) pairs.push([x, s[k]]); });
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [written, say] of pairs) out = out.replace(new RegExp(`(?<![\\p{L}])${esc(written)}(?![\\p{L}])`, "giu"), say);
  return out;
}
