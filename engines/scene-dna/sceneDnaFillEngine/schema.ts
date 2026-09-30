import { z } from "zod";
import { DialogueEmotionSchema } from "@aurastage/contracts";

const Neighbour = z.object({ number: z.number().int(), heading: z.string().max(300), int_ext: z.string().max(20).nullable().default(null), location: z.string().max(300).nullable().default(null), time_of_day: z.string().max(60).nullable().default(null), characters: z.array(z.string().max(120)).max(100).default([]) }).nullable().default(null);
export const SceneDnaFillInputSchema = z.object({
  scene: z.object({
    number: z.number().int(), heading: z.string().max(300), int_ext: z.string().max(20).nullable().default(null), location: z.string().max(300).nullable().default(null),
    time_of_day: z.string().max(60).nullable().default(null), estimated_seconds: z.number().nullable().default(null),
    /** The scene's action lines from the approved script, in order. */
    action: z.array(z.string().max(4000)).max(400).default([]),
  }),
  /** Spoken lines with their performance (Dialogue Intelligence or dialoguePerformanceEngine). */
  lines: z.array(z.object({ speaker: z.string().max(120), text: z.string().max(4000), emotion: DialogueEmotionSchema.nullable().default(null), intensity: z.number().nullable().default(null) })).max(2000).default([]),
  characters: z.array(z.string().max(120)).max(100).default([]),
  previous: Neighbour, next: Neighbour,
  is_first: z.boolean().default(false), is_last: z.boolean().default(false),
  project: z.object({ title: z.string().max(200).nullable().default(null), logline: z.string().max(1000).nullable().default(null), genre: z.string().max(100).nullable().default(null), tone: z.string().max(100).nullable().default(null), setting: z.string().max(300).nullable().default(null), time_period: z.string().max(100).nullable().default(null) }).default({}),
});
export type SceneDnaFillInput = z.input<typeof SceneDnaFillInputSchema>;

export const FieldSuggestionSchema = z.object({ value: z.unknown(), evidence: z.string().max(300) });
export const SceneDnaFillOutputSchema = z.object({
  fields: z.object({
    purpose: z.string().max(1000), stakes: z.string().max(1000), story_time: z.string().max(200), mood: z.array(z.string().max(40)).max(8),
    weather: z.string().max(200), atmosphere: z.string().max(500), lighting_intent: z.string().max(1000), sound_intent: z.string().max(1000),
    camera_energy: z.enum(["calm", "measured", "dynamic", "frenetic"]), continuity_notes: z.string().max(4000),
  }),
  evidence: z.record(z.string(), z.string().max(300)),
  engine_version: z.string(),
});
export type SceneDnaFillOutput = z.infer<typeof SceneDnaFillOutputSchema>;
