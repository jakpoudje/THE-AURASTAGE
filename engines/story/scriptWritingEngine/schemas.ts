import { z } from "zod";

// What every writing task knows about the story (canonical Project fields + the accepted Story Development).
export const WritingCharacterSchema = z.object({
  name: z.string().min(1).max(80), role: z.string().max(40), age: z.number().int().min(0).max(120).nullable(),
  description: z.string().max(800), want: z.string().max(300).default(""), need: z.string().max(300).default(""), arc: z.string().max(500).default(""),
});
export const StoryContextSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().default("feature_film"),
  logline: z.string().max(500).nullable().default(null),
  synopsis: z.string().max(20000).nullable().default(null),
  genre: z.string().max(100).nullable().default(null),
  tone: z.string().max(100).nullable().default(null),
  setting: z.string().max(200).nullable().default(null),
  time_period: z.string().max(100).nullable().default(null),
  target_runtime_minutes: z.number().int().min(1).max(600).nullable().default(null),
  characters: z.array(WritingCharacterSchema).max(40).default([]),
  beats: z.array(z.object({ act: z.number().int(), title: z.string().max(120), summary: z.string().max(800), approx_minute: z.number().int() })).max(60).default([]),
});
export type StoryContext = z.input<typeof StoryContextSchema>;

// ---- Scene outline ----
export const OutlineSceneSchema = z.object({
  number: z.number().int().min(1).max(400),
  int_ext: z.enum(["INT", "EXT", "INT/EXT"]),
  /** Canonical place name in capitals, reused exactly when a scene returns to a place. */
  location: z.string().min(1).max(120),
  time_of_day: z.string().min(1).max(40),
  purpose: z.string().max(300),
  beat: z.string().max(120),
  summary: z.string().min(1).max(1200),
  characters: z.array(z.string().max(80)).max(20),
  est_minutes: z.number().min(0.2).max(20),
}).strict();
export type OutlineScene = z.infer<typeof OutlineSceneSchema>;
export const OutlineOutputSchema = z.object({ scenes: z.array(OutlineSceneSchema).min(1).max(400), notes: z.array(z.string().max(300)).max(10) }).strict();
export type OutlineOutput = z.infer<typeof OutlineOutputSchema>;
export const OutlineInputSchema = z.object({ story: StoryContextSchema, request: z.string().max(2000).default("") });

// ---- Writing scenes (one batch per model call) ----
export const WriteScenesInputSchema = z.object({
  story: StoryContextSchema,
  outline: z.array(OutlineSceneSchema).min(1).max(400),
  /** The scene numbers to write in this batch. */
  numbers: z.array(z.number().int()).min(1).max(12),
  /** The end of the scene written just before this batch, so the story flows on. */
  previous_tail: z.string().max(4000).default(""),
  request: z.string().max(2000).default(""),
});
export type WriteScenesInput = z.input<typeof WriteScenesInputSchema>;
export const WrittenSceneSchema = z.object({ number: z.number().int(), fountain: z.string().min(20).max(40000) }).strict();
export const WriteScenesOutputSchema = z.object({ scenes: z.array(WrittenSceneSchema).min(1).max(12) }).strict();
export type WriteScenesOutput = z.infer<typeof WriteScenesOutputSchema>;

// ---- Rewriting one scene (improve / expand / rephrase / condense) or writing a new one ----
export const REWRITE_MODES = ["improve", "expand", "rephrase", "condense", "dialogue", "new_scene"] as const;
export const RewriteInputSchema = z.object({
  story: StoryContextSchema,
  mode: z.enum(REWRITE_MODES),
  /** The scene as written now (Fountain), empty for a new scene. */
  scene_text: z.string().max(40000).default(""),
  instruction: z.string().max(2000).default(""),
  before: z.string().max(4000).default(""),
  after: z.string().max(4000).default(""),
});
export type RewriteInput = z.input<typeof RewriteInputSchema>;
export const RewriteOutputSchema = z.object({ fountain: z.string().min(20).max(40000), changes: z.array(z.string().max(300)).max(12) }).strict();
export type RewriteOutput = z.infer<typeof RewriteOutputSchema>;

export const WritingCheckSchema = z.object({ id: z.string(), ok: z.boolean(), label: z.string(), evidence: z.string() });
export type WritingCheck = z.infer<typeof WritingCheckSchema>;
