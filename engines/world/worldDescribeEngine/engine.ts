// engines/world/worldDescribeEngine
// Built-in story intelligence (owner, 2026-09-30: "describing, filling out fields should not cost money"). Describes a
// location or prop for its reference views from the script's own words about it — interior/exterior, the times it is
// seen, its areas, and the look words (materials, colours, condition, light) in the action lines that name it — set in
// the story's place and period. Deterministic and free, with its evidence.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const WorldDescribeInputSchema = z.object({
  kind: z.enum(["location", "prop"]),
  name: z.string().max(160),
  int_ext: z.array(z.string().max(10)).max(4).default([]),
  times_of_day: z.array(z.string().max(40)).max(20).default([]),
  areas: z.array(z.string().max(120)).max(40).default([]),
  category: z.string().max(40).nullable().default(null),
  /** Action sentences from the approved script that name it (or, for a location, happen there). */
  mentions: z.array(z.object({ scene: z.number().int(), text: z.string().max(2000) })).max(500).default([]),
  project: z.object({ setting: z.string().max(300).nullable().default(null), time_period: z.string().max(100).nullable().default(null) }).default({}),
});
export type WorldDescribeInput = z.input<typeof WorldDescribeInputSchema>;
export const WorldDescribeOutputSchema = z.object({ description: z.string().max(2000), look_words: z.array(z.string()), evidence: z.string().max(300), engine_version: z.string() });
export type WorldDescribeOutput = z.infer<typeof WorldDescribeOutputSchema>;

const LOOK = /\b(old|new|ancient|modern|broken|rusty|rusted|dusty|peeling|cracked|clean|spotless|gleaming|faded|worn|battered|dented|crumbling|flickering|buzzing|bare|cluttered|crowded|empty|narrow|wide|cramped|huge|tiny|small|dark|dim|bright|sunlit|shadowy|damp|muddy|wet|dry|hot|stifling|air-conditioned|concrete|wooden|wood|metal|steel|iron|zinc|corrugated|plastic|glass|brick|tiled|marble|thatched|mud|canvas|tarpaulin|leather|velvet|white|black|red|green|blue|yellow|purple|brown|grey|gray|gold|silver|orange|pink|khaki)\b/gi;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quote = (s: string, n = 160) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function worldDescribeEngine(raw: unknown): WorldDescribeOutput {
  const w = WorldDescribeInputSchema.parse(raw);
  const where = [w.project.setting, w.project.time_period].filter(Boolean).join(", ");
  const text = w.mentions.map((m) => m.text).join(" ");
  const look = [...new Set((text.match(LOOK) ?? []).map((x) => x.toLowerCase()))].slice(0, 8);
  const scenes = [...new Set(w.mentions.map((m) => m.scene))].sort((a, b) => a - b);
  const parts: string[] = [];
  if (w.kind === "location") {
    const ie = w.int_ext.map((x) => (/^INT/i.test(x) ? "interior" : /^EXT/i.test(x) ? "exterior" : x.toLowerCase()));
    parts.push(`${w.name}: ${ie.length ? list([...new Set(ie)]) : "a location"}${where ? ` in ${where}` : ""}.`);
    if (w.times_of_day.length) parts.push(`Seen at ${list(w.times_of_day.map((t) => t.toLowerCase()))}.`);
    if (w.areas.length) parts.push(`Areas: ${list(w.areas)}.`);
  } else {
    parts.push(`${w.name}: ${w.category === "vehicle" ? "a vehicle" : "a prop"}${where ? ` in ${where}` : ""}${scenes.length ? `, seen in ${scenes.length === 1 ? `Scene ${scenes[0]}` : `Scenes ${list(scenes.slice(0, 6).map(String))}`}` : ""}.`);
  }
  if (look.length) parts.push(`Look: ${list(look)}.`);
  const quotes = w.mentions.slice(0, 3).map((m) => `"${quote(m.text)}" (Scene ${m.scene})`);
  if (quotes.length) parts.push(`From the script: ${quotes.join(" ")}`);
  if (!look.length) parts.push(w.kind === "location" ? "Dress it to feel lived-in and true to the place and period." : "Keep it true to the period and the owner's world.");
  return {
    description: cap(parts.join(" ")).slice(0, 2000),
    look_words: look,
    evidence: (w.mentions.length ? `${w.mentions.length} line(s) of action that name it` : "its scene headings and the story setting").slice(0, 300),
    engine_version: ENGINE_VERSION,
  };
}
