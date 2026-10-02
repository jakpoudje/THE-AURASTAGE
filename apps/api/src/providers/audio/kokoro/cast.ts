// Voice casting for the Kokoro natural voice (pure, unit-tested without the model). Each English Kokoro voice was
// MEASURED at image build time (median pitch of a test sentence, scripts/kokoro-say.mjs --setup → voices.json), so
// choosing a voice for a character uses evidence: gender from Casting, age band (child / young / adult / elder) from the
// Casting age, the character's accent where the model has it (American or British), and register from Voice DNA.
// Limits are said plainly in the reason (owner request 2026-10-02): the free model has no child voices and no African,
// Caribbean or Asian accents — those need a paid voice provider (ElevenLabs).

export interface KokoroVoice { id: string; name: string; gender: "female" | "male"; accent: "american" | "british"; grade: string | null; f0: number }
export interface KokoroCatalogue { model: string; voices: KokoroVoice[] }
export interface KokoroPick { voice: string; name: string; gender: "female" | "male"; accent: "american" | "british"; f0: number; speed_factor: number; reason: string }
interface BaseDna { language: string; gender: "female" | "male" | "unspecified"; pitch: number; age_band?: "child" | "young" | "adult" | "elder" }

const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
/** The model's published quality grades (A best … F) as a small ranking bonus, so better voices win close calls. */
const GRADE: Record<string, number> = { A: 0, "A-": 1, "B+": 2, B: 3, "B-": 4, "C+": 5, C: 6, "C-": 7, "D+": 8, D: 9, "D-": 10, "F+": 11, F: 12 };
const gradeRank = (g: string | null) => GRADE[g ?? ""] ?? 9;

const BRITISH = /brit|english|england|wales|welsh|scot|irish|ireland|london|\buk\b|united kingdom|yorkshire|manchester|liverpool|geordie|cockney|received pronunciation|\brp\b/i;
const AMERICAN = /americ|\busa?\b|united states|new york|texas|california|chicago|canad|boston|southern us/i;

/** Which of the model's two accents a character should use, and whether that matches what Casting asked for. */
export function accentOf(language: string, accentText: string | null): { accent: "american" | "british"; asked: string | null; matched: boolean } {
  const t = (accentText ?? "").trim();
  if (t && BRITISH.test(t)) return { accent: "british", asked: t, matched: true };
  if (t && AMERICAN.test(t)) return { accent: "american", asked: t, matched: true };
  return { accent: language === "en-us" ? "american" : "british", asked: t || null, matched: !t };
}

/**
 * The voice for a character, from their BASE Voice DNA (profile only) so they sound like the same person in every line.
 * Register target by gender and age band; among the closest few voices (quality breaks ties) the name decides, so two
 * similar characters don't share one voice. Elders speak a little slower, the young a little quicker.
 */
export function pickKokoroVoice(cat: KokoroCatalogue, dna: BaseDna, name: string, accentText: string | null = null): KokoroPick | null {
  if (!cat.voices.length) return null;
  const h = hash(name.trim().toLowerCase());
  const gender = dna.gender === "unspecified" ? (h % 2 ? "female" : "male") : dna.gender;
  const age = dna.age_band ?? "adult";
  const acc = accentOf(dna.language, accentText);
  const byGender = cat.voices.filter((v) => v.gender === gender);
  const pool0 = byGender.filter((v) => v.accent === acc.accent);
  const pool = pool0.length ? pool0 : byGender.length ? byGender : cat.voices;
  // Register: Voice DNA pitch 0–99 within the gender's adult range, lifted for the young and children, lowered for elders.
  const [lo, hi] = gender === "female" ? [165, 255] : [85, 160];
  const shift = age === "child" ? 1.25 : age === "young" ? 1.06 : age === "elder" ? 0.9 : 1;
  const target = (lo + ((hi - lo) * Math.max(0, Math.min(99, dna.pitch))) / 99) * shift;
  const score = (v: KokoroVoice) => Math.abs(v.f0 - target) / 12 + gradeRank(v.grade) * 0.6;
  const ranked = [...pool].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
  const near = ranked.slice(0, Math.min(3, ranked.length));
  const v = near[h % near.length];
  const speed_factor = age === "elder" ? 0.93 : age === "child" ? 1.06 : age === "young" ? 1.03 : 1;
  const where = v.accent === "american" ? "American" : "British";
  const notes: string[] = [];
  if (!acc.matched && acc.asked) notes.push(`no free voice speaks a ${acc.asked} accent yet — ${where} English is used; a paid voice provider (ElevenLabs) can match it`);
  if (age === "child") notes.push("the free model has no child voices — the youngest-sounding voice is used; a paid voice provider has real child voices");
  return {
    voice: v.id, name: v.name, gender, accent: v.accent, f0: v.f0, speed_factor,
    reason: `${where} ${gender} voice “${v.name}”, measured at ${Math.round(v.f0)} Hz (target ${Math.round(target)} Hz for ${age === "adult" ? "an adult" : age === "elder" ? "an elder" : age === "young" ? "a young" : "a child"} ${gender} at register ${dna.pitch}/99)${notes.length ? ` — ${notes.join("; ")}` : ""}`,
  };
}

/** Speaking rate from the line's Voice DNA (words per minute; 168 is normal) and the character's age. */
export const kokoroSpeed = (line: { speed: number }, pick: { speed_factor: number }) =>
  Math.round(Math.max(0.7, Math.min(1.4, (Math.max(80, line.speed) / 168) * pick.speed_factor)) * 100) / 100;
