import { z } from "zod";

// What the assistant proposes. Nothing is applied until the writer accepts it field by field.
export const ProposedCharacterSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(["protagonist", "antagonist", "supporting", "minor"]),
  age: z.number().int().min(0).max(120).nullable(),
  /** Why this name fits: culture, era, class, meaning — grounded in the setting. */
  name_reasoning: z.string().max(400),
  description: z.string().max(800),
  want: z.string().max(300),
  need: z.string().max(300),
  arc: z.string().max(500),
}).strict();

export const BeatSchema = z.object({
  act: z.number().int().min(1).max(5),
  title: z.string().max(120),
  summary: z.string().max(800),
  /** Rough start in story minutes, so beats can be checked against the runtime. */
  approx_minute: z.number().int().min(0).max(600),
}).strict();

export const StoryDevelopmentOutputSchema = z.object({
  title_options: z.array(z.string().max(120)).min(1).max(5),
  logline: z.string().min(10).max(500),
  synopsis: z.string().min(50).max(6000),
  themes: z.array(z.string().max(80)).min(1).max(6),
  genre: z.string().max(100),
  tone: z.string().max(100),
  setting: z.string().max(200),
  time_period: z.string().max(100),
  /** Up to 24 (a feature with a large cast must not lose people named in the brief — was 12). */
  characters: z.array(ProposedCharacterSchema).min(1).max(24),
  beats: z.array(BeatSchema).min(3).max(40),
  /** Things the assistant assumed because the brief didn't say — shown to the writer. */
  assumptions: z.array(z.string().max(300)).max(10),
}).strict();
export type StoryDevelopmentOutput = z.infer<typeof StoryDevelopmentOutputSchema>;

export const StoryDevelopmentCheckSchema = z.object({ id: z.string(), ok: z.boolean(), label: z.string(), evidence: z.string() });
