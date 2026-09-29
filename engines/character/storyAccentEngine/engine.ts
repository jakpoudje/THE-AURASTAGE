// engines/character/storyAccentEngine — suggests how a character might speak from what the STORY says: the character's
// own stated nationality, description and backstory first, then where their scenes are set, then the project setting.
// It never reads a name (a name says nothing reliable about how anyone speaks). Every suggestion cites its evidence and
// is only a suggestion; the writer decides and can type anything.
import { z } from "zod";
import { REGIONS, type Region } from "./regions";
import { ENGINE_VERSION } from "./version";

export const StoryAccentInputSchema = z.object({
  character: z.object({
    nationality: z.string().max(100).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    backstory: z.string().max(8000).nullable().optional(),
    occupation: z.string().max(150).nullable().optional(),
  }),
  /** Locations of the scenes the character appears in (from the approved script). */
  scene_locations: z.array(z.string().max(200)).max(400).default([]),
  project: z.object({ setting: z.string().max(200).nullable().optional(), time_period: z.string().max(100).nullable().optional(), logline: z.string().max(500).nullable().optional() }),
});
export type StoryAccentInput = z.input<typeof StoryAccentInputSchema>;
export interface AccentSuggestion { accent: string; languages: string[]; place: string; evidence: string[]; confidence: "stated" | "story" | "setting" }
export interface StoryAccentOutput { suggestion: AccentSuggestion | null; alternatives: AccentSuggestion[]; engine_version: string }

const find = (text: string | null | undefined): Region | undefined => (text ? REGIONS.find((r) => r.re.test(text)) : undefined);

export function storyAccentEngine(raw: unknown): StoryAccentOutput {
  const { character: c, scene_locations, project } = StoryAccentInputSchema.parse(raw);
  const found: { region: Region; why: string; confidence: AccentSuggestion["confidence"]; weight: number }[] = [];
  const add = (region: Region | undefined, why: string, confidence: AccentSuggestion["confidence"], weight: number) => region && found.push({ region, why, confidence, weight });
  add(find(c.nationality), `Nationality in the profile: ${c.nationality}`, "stated", 100);
  // "from Kano", "grew up in Accra", "born in Kingston" in the character's own text.
  for (const [label, text] of [["Description", c.description], ["Background", c.backstory]] as const) {
    const m = text?.match(/\b(?:from|grew up in|born in|raised in|native of|moved from|lives in|home in)\s+([^.,;\n]{2,60})/i);
    if (m) add(find(m[1]), `${label}: "${m[0].trim()}"`, "story", 80);
    else add(find(text), `${label} mentions ${find(text)?.place}`, "story", 50);
  }
  const counts = new Map<string, { region: Region; n: number }>();
  for (const loc of scene_locations) { const r = find(loc); if (r) counts.set(r.id, { region: r, n: (counts.get(r.id)?.n ?? 0) + 1 }); }
  for (const { region, n } of counts.values()) add(region, `${n} of the character's scene${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} set in ${region.place}`, "setting", 35 + Math.min(20, n * 4));
  add(find(project.setting) ?? find(project.logline), `The story is set in ${find(project.setting)?.place ?? find(project.logline)?.place}`, "setting", 25);

  // One suggestion per place, strongest evidence first; the evidence of repeated finds is merged.
  const byPlace = new Map<string, AccentSuggestion & { weight: number }>();
  for (const f of found) {
    const e = byPlace.get(f.region.id);
    if (e) { e.evidence.push(f.why); e.weight += f.weight; if (f.weight > 50 && e.confidence === "setting") e.confidence = f.confidence; }
    else byPlace.set(f.region.id, { accent: f.region.accent, languages: f.region.languages, place: f.region.place, evidence: [f.why], confidence: f.confidence, weight: f.weight });
  }
  const ranked = [...byPlace.values()].sort((a, b) => b.weight - a.weight).map(({ weight: _w, ...s }) => s);
  return { suggestion: ranked[0] ?? null, alternatives: ranked.slice(1, 4), engine_version: ENGINE_VERSION };
}
