// engines/audio/musicSuggestionEngine
// Built-in music intelligence (BUILD_PLAN §8 item 5): reads a scene's locked Scene DNA (mood, sound intent), the emotions
// of its dialogue, where it sits in the film and the film's genre, tone and setting, and suggests the scene's music cue
// from the BUILT-IN LIBRARY — the styles the built-in generator (proceduralAudioEngine) really plays, so "Generate" makes
// exactly what is suggested, for free. Each suggestion also names instruments for a composer or a music provider (they
// are a brief; the built-in generator plays synth voices). Some scenes are best without score; the engine says so and why.
import { z } from "zod";
import { REGIONS } from "../../character/storyAccentEngine/regions";
import { ENGINE_VERSION } from "./version";

/** The built-in library. `words` are the words the built-in generator reads to pick the same style (keep in step). */
export const MUSIC_LIBRARY = [
  { id: "tense_pulse", name: "Tense minor pulse", words: "tense, suspense", key: "A minor", bpm: 96, feel: "a low pulse under held minor chords", match: /tens|nervous|threat|menac|suspens|danger|fear|oppress|claustro|anticipat|urgent|volatile|anger/i },
  { id: "sorrow_pad", name: "Slow minor pad", words: "sad, melancholy", key: "D minor", bpm: 60, feel: "slow, open minor chords with space", match: /sad|melanchol|grief|loss|lonel|desperat|resign|weary|mourn/i },
  { id: "warm_sevenths", name: "Warm major sevenths", words: "romantic, tender, warm", key: "F major", bpm: 72, feel: "soft major-seventh chords", match: /romant|love|intimat|tender|warm|trust|affection/i },
  { id: "bright_rise", name: "Bright major progression", words: "hope, uplift", key: "G major", bpm: 100, feel: "a rising major progression with a light pulse", match: /hope|joy|triumph|uplift|bright|determin|defian|resolve|celebrat/i },
  { id: "dark_drone", name: "Dark drone", words: "eerie, dark, mysterious", key: "G minor", bpm: 70, feel: "a low, still drone with slow movement", match: /eerie|dark|cold|myster|uneas|cynic|contempt|disgust|bitter|ominous/i },
  { id: "driving_ostinato", name: "Driving minor ostinato", words: "action, chase", key: "B minor", bpm: 140, feel: "a fast repeated figure over a low bass", match: /chaot|action|chase|frenet|fight|escape|run|attack/i },
  { id: "neutral_pad", name: "Neutral pad", words: "calm", key: "E major", bpm: 80, feel: "a quiet, neutral bed", match: /calm|neutral|quiet|still|reflect/i },
] as const;
export type MusicStyleId = (typeof MUSIC_LIBRARY)[number]["id"];

/** Instruments a composer might reach for, by the country the story is set in, else by genre. */
const REGIONAL: Record<string, string[]> = {
  ng: ["talking drum", "shekere", "highlife guitar", "strings"], gh: ["highlife guitar", "kpanlogo drums", "strings"], sn: ["kora", "sabar drums", "strings"],
  ke: ["nyatiti", "hand drums", "strings"], za: ["mbira", "choir", "strings"], et: ["krar", "kebero drum", "strings"], eg: ["oud", "ney", "strings"], ma: ["oud", "bendir", "strings"],
  gb: ["strings", "piano", "brass"], ie: ["fiddle", "tin whistle", "strings"], fr: ["accordion", "piano", "strings"], es: ["nylon guitar", "cajón", "strings"], it: ["mandolin", "strings", "piano"],
  ru: ["balalaika", "choir", "strings"], pl: ["piano", "strings"], de: ["piano", "strings", "brass"],
};
const BY_GENRE: [RegExp, string[]][] = [
  [/thriller|crime/i, ["low strings", "synth bass", "percussion"]], [/horror/i, ["prepared piano", "bowed metal", "low strings"]], [/romance/i, ["piano", "strings", "acoustic guitar"]],
  [/war/i, ["snare", "brass", "low strings"]], [/science|sci-fi/i, ["synthesiser", "processed strings"]], [/comedy/i, ["pizzicato strings", "woodwinds", "light percussion"]],
  [/family|drama/i, ["piano", "strings", "acoustic guitar"]], [/sport/i, ["drums", "electric guitar", "brass"]],
];

export const MusicSuggestionInputSchema = z.object({
  film: z.object({ genre: z.string().max(120).nullable().default(null), tone: z.string().max(200).nullable().default(null), setting: z.string().max(300).nullable().default(null) }).default({}),
  scene: z.object({
    number: z.number().int().min(0), heading: z.string().max(300).default(""), time_of_day: z.string().max(60).nullable().default(null),
    mood: z.array(z.string().max(120)).max(20).default([]), sound_intent: z.string().max(2000).nullable().default(null),
    emotions: z.array(z.string().max(40)).max(2000).default([]), dialogue_seconds: z.number().min(0).default(0), seconds: z.number().min(0).default(0),
  }),
  /** Where the scene sits: 0-based index among the film's scenes and how many there are. */
  position: z.object({ index: z.number().int().min(0), total: z.number().int().min(1) }).default({ index: 0, total: 1 }),
});
export type MusicSuggestionInput = z.input<typeof MusicSuggestionInputSchema>;
export interface MusicSuggestion {
  needed: boolean;
  style: { id: MusicStyleId; name: string };
  key: string;
  tempo_bpm: number;
  /** The text the built-in generator reads (it picks the same style from these words). */
  description: string;
  instruments: string[];
  placement: string;
  level_db: number;
  why: string[];
  engine_version: string;
}

export function musicSuggestionEngine(raw: MusicSuggestionInput): MusicSuggestion {
  const i = MusicSuggestionInputSchema.parse(raw);
  const s = i.scene, why: string[] = [];
  const first = i.position.index === 0, last = i.position.index === i.position.total - 1 && i.position.total > 1;

  // The mood the scene plays: Scene DNA first (a person approved it), then the dialogue's emotions, then the film's tone.
  const emo = new Map<string, number>();
  for (const e of s.emotions) if (e && e !== "neutral") emo.set(e, (emo.get(e) ?? 0) + 1);
  const topEmotions = [...emo.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e).slice(0, 3);
  const sources: [string, string][] = [];
  if (s.mood.length) sources.push([s.mood.join(" "), `Scene DNA mood (${s.mood.join(", ")})`]);
  if (s.sound_intent) sources.push([s.sound_intent, "Scene DNA sound intent"]);
  if (topEmotions.length) sources.push([topEmotions.join(" "), `the dialogue's emotions (${topEmotions.join(", ")})`]);
  if (i.film.tone) sources.push([i.film.tone, `the film's tone (${i.film.tone})`]);
  let style: (typeof MUSIC_LIBRARY)[number] | undefined;
  for (const [text, from] of sources) {
    style = MUSIC_LIBRARY.find((m) => m.match.test(text));
    if (style) { why.push(`${style.name} — from ${from}`); break; }
  }
  if (!style) { style = MUSIC_LIBRARY.find((m) => m.id === "neutral_pad")!; why.push("Neutral pad — no mood in Scene DNA, the dialogue or the film's tone yet"); }

  // Whether the scene wants score at all.
  const talky = s.seconds > 0 && s.dialogue_seconds / s.seconds > 0.75;
  const strong = s.mood.length > 0 || emo.size > 0;
  let needed = true;
  if (first) why.push("the film's opening — music sets the tone");
  else if (last) why.push("the film's last scene — music carries it out");
  else if (talky && !strong) { needed = false; why.push("mostly dialogue with no strong mood — let the words carry it (no score)"); }
  else if (talky) why.push("mostly dialogue — keep it low under the lines");

  // Instruments for a composer or a music provider: the setting's, else the genre's.
  const region = i.film.setting ? REGIONS.find((r) => new RegExp(r.re.source, "i").test(i.film.setting!)) : undefined;
  const regional = region ? REGIONAL[region.id.split("-")[0]] : undefined;
  const genreInst = BY_GENRE.find(([re]) => re.test(i.film.genre ?? ""))?.[1];
  const instruments = regional ?? genreInst ?? ["piano", "strings"];
  if (regional) why.push(`instruments from where the story is set (${region!.place})`);
  else if (genreInst) why.push(`instruments for the genre (${i.film.genre})`);

  const placement = !needed ? "No score — dialogue and sound carry the scene" : talky ? "Under the dialogue, low; swell between lines" : first ? "From the first frame; settle under the first line" : last ? "Build to the end of the scene and into the credits" : "Across the scene at a bed level";
  const level_db = !needed ? -60 : talky ? -18 : -12;
  const description = `${style.name} (${style.words}) in ${style.key}, ${style.bpm} BPM — ${style.feel}${first ? "; main theme" : ""}`;
  return { needed, style: { id: style.id, name: style.name }, key: style.key, tempo_bpm: style.bpm, description, instruments, placement, level_db, why, engine_version: ENGINE_VERSION };
}
