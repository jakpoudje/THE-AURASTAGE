// engines/character/wardrobeSuggestionEngine
// Built-in story intelligence (owner, 2026-09-30: wardrobe is one of the decisions the engines make). Proposes a
// character's first wardrobe look: what the script says they wear first; otherwise what their work implies; otherwise
// everyday clothes for the story's setting and period. Deterministic and free, with the evidence it came from. Never
// reads anything from a name.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const WardrobeInputSchema = z.object({
  character: z.object({ name: z.string().max(120), occupation: z.string().max(150).nullable().default(null), age: z.string().max(40).nullable().default(null), gender: z.string().max(60).nullable().default(null), description: z.string().max(4000).nullable().default(null) }),
  /** The introduction and action sentences that name the character. */
  mentions: z.array(z.string().max(2000)).max(1000).default([]),
  project: z.object({ setting: z.string().max(300).nullable().default(null), time_period: z.string().max(100).nullable().default(null), genre: z.string().max(100).nullable().default(null) }).default({}),
});
export type WardrobeInput = z.input<typeof WardrobeInputSchema>;
export const WardrobeOutputSchema = z.object({ look: z.object({ name: z.string().min(1).max(80), description: z.string().max(2000) }), evidence: z.string().max(300), source: z.enum(["script", "occupation", "setting"]), engine_version: z.string() });
export type WardrobeOutput = z.infer<typeof WardrobeOutputSchema>;

const CLOTHES = "khaki|uniform|suit|jacket|coat|shirt|t-shirt|tee|blouse|dress|skirt|trousers|jeans|shorts|agbada|kaftan|caftan|buba|iro|wrapper|gele|headtie|head-tie|ankara|aso-oke|fila|cap|hat|beret|hijab|headscarf|veil|robe|cassock|gown|overalls|apron|scrubs|sandals|slippers|shoes|boots|sneakers|trainers|heels|scarf|vest|singlet|hoodie|sweater|cardigan|blazer|lab coat|sunglasses|glasses|beads|bangle|wristwatch|necklace|earrings|jersey|tracksuit|tunic|jellabiya|babanriga|lanyard|bib";
const WEAR = new RegExp(`\\b((?:[a-z-]+[ ,]+){0,3}?)(${CLOTHES})s?\\b`, "gi");
const SKIP = /^(a|an|the|his|her|their|its|in|wears?|wearing|dressed|with|and|of|on|at|to|is|still|stands|sits)$/i;
const BY_JOB: [RegExp, string, string][] = [
  [/corps member|nysc/i, "NYSC uniform", "NYSC khaki uniform, crested cap, jungle boots."],
  [/police|inspector|sergeant|constable/i, "Police uniform", "Police uniform with the rank on the shoulders, beret, black boots."],
  [/soldier|army|colonel|captain|lieutenant|general/i, "Military fatigues", "Military fatigues, beret, boots."],
  [/doctor|surgeon/i, "Doctor's whites", "White coat over a shirt and trousers, stethoscope."],
  [/nurse|midwife/i, "Nurse's uniform", "Nurse's uniform, flat shoes, watch pinned at the chest."],
  [/pastor|priest|reverend|bishop/i, "Clergy", "Clerical shirt and collar, dark trousers."],
  [/imam/i, "Imam's robes", "Flowing robe and cap."],
  [/lawyer|barrister|judge|magistrate/i, "Court wear", "Dark suit; wig and gown when in court."],
  [/journalist|reporter|photographer/i, "On assignment", "Practical shirt and trousers, press lanyard, a bag for kit."],
  [/driver|okada|mechanic/i, "Working clothes", "Worn working clothes, sandals or boots, a cap against the sun."],
  [/trader|market|vendor|hawker|shopkeeper/i, "Market day", "Ankara wrapper and blouse, headtie, slippers."],
  [/official|officer|clerk|civil servant|agent|secretary/i, "Office wear", "Plain shirt and trousers or a simple dress, an ID badge."],
  [/student/i, "Student", "Casual shirt or tee, jeans, trainers, a backpack."],
  [/business|banker|accountant|entrepreneur|engineer|architect/i, "Business", "Well-cut suit or smart dress, polished shoes."],
  [/governor|senator|minister|politician|chief|chairman|candidate|president/i, "Public figure", "Rich traditional attire or a sharp suit, cap to match — dressed to be seen."],
  [/guard|security|bodyguard|thug/i, "Security", "Dark clothes, heavy boots, nothing that gets in the way."],
];
const WEST_AFRICA = /nigeria|lagos|abuja|kano|ibadan|port harcourt|enugu|accra|ghana|west africa/i;

export function wardrobeSuggestionEngine(raw: unknown): WardrobeOutput {
  const { character, mentions, project } = WardrobeInputSchema.parse(raw);
  const text = [character.description ?? "", ...mentions].join(" ");
  // 1. What the script says they wear.
  const found: string[] = [];
  for (const m of text.matchAll(WEAR)) {
    const words = m[1].split(/[ ,]+/).filter(Boolean);
    // Only the words that describe the garment: those after the last "in", "wearing", "his"… before it.
    let cut = -1;
    words.forEach((w, i) => { if (SKIP.test(w)) cut = i; });
    const phrase = [...words.slice(cut + 1), m[2].toLowerCase()].join(" ").toLowerCase().trim();
    if (!found.some((f) => f.includes(phrase) || phrase.includes(f))) found.push(phrase);
  }
  const period = [project.setting, project.time_period].filter(Boolean).join(", ");
  if (found.length) {
    const desc = `${found.slice(0, 6).map((f, i) => (i === 0 ? f.charAt(0).toUpperCase() + f.slice(1) : f)).join(", ")} — as the script describes${period ? ` (${period})` : ""}.`;
    return { look: { name: `As written: ${found[0]}`.slice(0, 80), description: desc.slice(0, 2000) }, evidence: `the script: "${found.slice(0, 3).join(", ")}"`.slice(0, 300), source: "script", engine_version: ENGINE_VERSION };
  }
  // 2. What their work implies.
  const job = character.occupation ?? "";
  const byJob = job ? BY_JOB.find(([re]) => re.test(job)) : undefined;
  if (byJob) {
    const local = byJob[1] === "Market day" && project.setting && !WEST_AFRICA.test(project.setting) ? "Practical market clothes, apron, comfortable shoes." : byJob[2];
    return { look: { name: byJob[1], description: `${local}${period ? ` Set in ${period}.` : ""}`.slice(0, 2000) }, evidence: `their occupation (${job})`.slice(0, 300), source: "occupation", engine_version: ENGINE_VERSION };
  }
  // 3. Everyday clothes for the setting and period.
  const who = character.age ? `someone of ${character.age}` : "the character";
  return {
    look: { name: "Everyday look", description: `Everyday clothes for ${who}${period ? ` in ${period}` : ""}: simple, lived-in, nothing that pulls focus. Adjust once the character's style is decided.`.slice(0, 2000) },
    evidence: period ? `the story's setting (${period})`.slice(0, 300) : "no wardrobe in the script yet", source: "setting", engine_version: ENGINE_VERSION,
  };
}
