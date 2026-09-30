// engines/story/storySetupEngine
// Built-in story intelligence (owner, 2026-09-30: "every page and every field has engines reading from the storyline").
// Reads the approved script — headings, action, dialogue and its performance, the cast — and proposes:
//   • the story setup in Scriptwriter: genre, tone, setting, time period, logline;
//   • the film's Project Settings: visual style (look + palette), country, year, the opening title card's line.
// Deterministic and free; every value carries the evidence it came from. Callers fill only empty fields.
import { z } from "zod";
import { REGIONS } from "../../character/storyAccentEngine/regions";
import { ENGINE_VERSION } from "./version";

export const StorySetupInputSchema = z.object({
  title: z.string().max(200).nullable().default(null),
  headings: z.array(z.string().max(300)).max(2000).default([]),
  action: z.array(z.string().max(4000)).max(20000).default([]),
  /** Emotions of the spoken lines (Dialogue Intelligence or the built-in reads). */
  emotions: z.array(z.string().max(40)).max(50000).default([]),
  /** The lead(s), most important first, with what they want when Casting knows it. */
  leads: z.array(z.object({ name: z.string().max(120), occupation: z.string().max(150).nullable().default(null), motivation: z.string().max(2000).nullable().default(null) })).max(10).default([]),
  existing: z.object({ genre: z.string().nullable().default(null), tone: z.string().nullable().default(null), setting: z.string().nullable().default(null), time_period: z.string().nullable().default(null) }).default({}),
  year_now: z.number().int().min(1900).max(2200),
});
export type StorySetupInput = z.input<typeof StorySetupInputSchema>;
export interface StorySetupOutput {
  story: { genre?: string; tone?: string; setting?: string; time_period?: string; logline?: string };
  settings: { look?: string; palette?: string[]; country?: string; year?: number; opening_subtitle?: string };
  evidence: Record<string, string>;
  engine_version: string;
}

const GENRES: [string, RegExp][] = [
  ["Political thriller", /\b(election|ballot|vote[sd]?|voting|polling|campaign|senator|governor|president|minister|rigg(?:ed|ing)|result sheet|INEC|parliament|coup)\b/gi],
  ["Crime thriller", /\b(police|detective|murder|killed|gun|gunshot|body|crime|arrest|gang|robbery|smuggl\w*|cartel|drugs?)\b/gi],
  ["Romance", /\b(kiss(?:es|ed)?|love|lover|wedding|date|romance|heart|marry|married)\b/gi],
  ["Horror", /\b(scream(?:s|ing)?|blood|ghost|demon|possessed|corpse|shadow moves|creature|haunted)\b/gi],
  ["Comedy", /\b(laughs?|joke|funny|hilarious|comic|grins?|prank)\b/gi],
  ["War drama", /\b(soldiers?|battle|war|bomb|troops|rifle|frontline|militia)\b/gi],
  ["Science fiction", /\b(spaceship|planet|robot|android|laser|alien|galaxy|hologram|AI system)\b/gi],
  ["Family drama", /\b(mother|father|mama|papa|son|daughter|brother|sister|grandma|grandfather|family)\b/gi],
  ["Sports drama", /\b(match|goal|coach|stadium|team|training|championship|race)\b/gi],
];
const TONE_OF: Record<string, string> = {
  tension: "Tense", fear: "Suspenseful", anger: "Volatile", determination: "Defiant", sadness: "Melancholic", love: "Tender", joy: "Hopeful",
  contempt: "Cynical", resignation: "Weary", trust: "Warm", anticipation: "Urgent", surprise: "Unpredictable", disgust: "Bitter",
};
const LOOK_OF: Record<string, string> = {
  "Political thriller": "Grounded, observational realism: handheld energy in crowds, still frames in rooms of power; practical, motivated light with hard contrast at night",
  "Crime thriller": "Low-key, high-contrast light; deep shadows and sodium-street colour at night; tight framing that withholds",
  Romance: "Soft, warm light and shallow focus; golden-hour exteriors; unhurried, close framing",
  Horror: "Low-key light with deep blacks; cold, desaturated colour; slow, creeping camera and negative space",
  Comedy: "Bright, even light and clean colour; wide enough to see the reactions",
  "War drama": "Desaturated, gritty colour; handheld in combat, still in the aftermath; natural and practical light",
  "Science fiction": "Clean graphic compositions; cool colour with light from screens and practicals",
  "Family drama": "Naturalistic, warm interiors; window light; observational camera close to the family",
  "Sports drama": "Bright, kinetic daylight; long lenses and movement in play, intimate close-ups off it",
  Drama: "Naturalistic, motivated light; observational camera that stays with the characters",
};
const PALETTE_OF: Record<string, string[]> = {
  "Political thriller": ["#1F2A2E", "#C8A24A", "#6B7F5E", "#A33B2B", "#E8E1D0"],
  "Crime thriller": ["#0E1A24", "#D98E2B", "#3E5A63", "#8C1C13", "#C9C3B6"],
  Romance: ["#F2C6A0", "#D9826B", "#8C5B4A", "#F6E7D8", "#6E7F80"],
  Horror: ["#0B0B0D", "#3B3F45", "#6E1414", "#9AA3A6", "#1E2B24"],
  Comedy: ["#FFD166", "#06D6A0", "#118AB2", "#EF476F", "#FFFFFF"],
  "War drama": ["#3F4238", "#6B705C", "#A5A58D", "#7F4F24", "#D6CCC2"],
  "Science fiction": ["#0B132B", "#1C2541", "#3A506B", "#5BC0BE", "#E0FBFC"],
  "Family drama": ["#E9C46A", "#F4A261", "#2A9D8F", "#264653", "#F1FAEE"],
  "Sports drama": ["#1D3557", "#E63946", "#F1FAEE", "#A8DADC", "#457B9D"],
  Drama: ["#2B2D42", "#8D99AE", "#EDF2F4", "#D90429", "#C9ADA7"],
};
const COUNTRY: Record<string, string> = { ng: "Nigeria", gh: "Ghana", ke: "Kenya", tz: "Tanzania", ug: "Uganda", et: "Ethiopia", za: "South Africa", zw: "Zimbabwe", sn: "Senegal", cm: "Cameroon", cd: "DR Congo", eg: "Egypt", ma: "Morocco", gb: "United Kingdom", ie: "Ireland", fr: "France", de: "Germany", it: "Italy", es: "Spain", pt: "Portugal", ru: "Russia", ua: "Ukraine", pl: "Poland" };
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function storySetupEngine(raw: StorySetupInput): StorySetupOutput {
  const i = StorySetupInputSchema.parse(raw);
  const text = [...i.headings, ...i.action].join("\n");
  const ev: Record<string, string> = {};
  const story: StorySetupOutput["story"] = {};
  const settings: StorySetupOutput["settings"] = {};

  // Genre: the family of words the script uses most.
  const scored = GENRES.map(([g, re]) => [g, (text.match(re) ?? []).length] as const).sort((a, b) => b[1] - a[1]);
  const genre = scored[0] && scored[0][1] >= 3 ? scored[0][0] : "Drama";
  story.genre = genre;
  ev.genre = scored[0] && scored[0][1] >= 3 ? `${scored[0][1]} ${genre.toLowerCase()} words in the script` : "no strong genre signal in the script";

  // Tone: the dialogue's dominant emotions.
  const count = new Map<string, number>();
  for (const e of i.emotions) if (e && e !== "neutral") count.set(e, (count.get(e) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => TONE_OF[e]).filter(Boolean).slice(0, 2);
  if (top.length) { story.tone = top.join(" and "); ev.tone = `the dialogue's strongest emotions (${[...count.keys()].slice(0, 3).join(", ")})`; }

  // Setting: the place the headings and action name most.
  const places = REGIONS.map((r) => [r, (text.match(new RegExp(r.re.source, "gi")) ?? []).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const place = places[0]?.[0];
  if (place) {
    const country = COUNTRY[place.id.split("-")[0]];
    story.setting = country && country !== place.place ? `${place.place}, ${country}` : place.place;
    ev.setting = `${places[0][1]} mention(s) of ${place.place} in the script`;
    if (country) { settings.country = country; ev.country = ev.setting; }
  }

  // Time period: years the script names, else the present day.
  const years = (text.match(/\b(1[5-9]\d\d|20\d\d)\b/g) ?? []).map(Number);
  if (years.length) {
    const y = years.sort((a, b) => a - b);
    story.time_period = y[0] === y[y.length - 1] ? String(y[0]) : `${y[0]}–${y[y.length - 1]}`;
    ev.time_period = `years named in the script (${[...new Set(y)].slice(0, 4).join(", ")})`;
  } else { story.time_period = "Present day"; ev.time_period = "no year named in the script"; }

  // Logline: the lead, what they want, where — from Casting's development of the lead.
  const lead = i.leads[0];
  if (lead?.motivation) {
    const want = lead.motivation.replace(/^Drives the story:\s*/i, "").replace(/^Wants\s+to\s+/i, "").replace(/\.\s.*$/s, "").replace(/\.$/, "");
    story.logline = `${lead.occupation ? `${lead.name}, ${lc(lead.occupation.replace(/^(a|an)\s+/i, ""))},` : lead.name} fights to ${lc(want).replace(/^to /, "")}${story.setting ? ` in ${story.setting}` : ""}.`.slice(0, 500);
    ev.logline = "the lead's motivation in Casting";
  }

  // Project Settings from the story.
  const g = i.existing.genre && LOOK_OF[i.existing.genre] ? i.existing.genre : genre;
  const toneWord = i.existing.tone ?? story.tone ?? null;
  settings.look = `${LOOK_OF[g] ?? LOOK_OF.Drama}${toneWord ? `. ${toneWord} in feel` : ""}${(i.existing.setting ?? story.setting) ? `, rooted in ${i.existing.setting ?? story.setting}` : ""}${(i.existing.time_period ?? story.time_period) && (i.existing.time_period ?? story.time_period) !== "Present day" ? ` (${i.existing.time_period ?? story.time_period})` : ""}.`.slice(0, 500);
  ev.look = `the genre (${g})${toneWord ? ` and tone (${toneWord})` : ""}`;
  settings.palette = PALETTE_OF[g] ?? PALETTE_OF.Drama;
  ev.palette = ev.look;
  settings.year = i.year_now;
  ev.year = "this year";
  if (story.logline) { settings.opening_subtitle = story.logline.slice(0, 200); ev.opening_subtitle = "the logline"; }
  return { story, settings, evidence: ev, engine_version: ENGINE_VERSION };
}
