import { z } from "zod";
import { DialogueEmotionSchema } from "@aurastage/contracts";

export const CharacterProfileInputSchema = z.object({
  character: z.object({ name: z.string().max(120), role: z.string().max(40).nullable().default(null), occupation: z.string().max(150).nullable().default(null), age: z.string().max(40).nullable().default(null) }),
  /** The script's introduction of the character (e.g. "TOMIWA (22), lanky, a phone charger coiled round his wrist"). */
  introduction: z.string().max(4000).nullable().default(null),
  intro_age: z.string().max(40).nullable().default(null),
  /** Their spoken lines in story order, with the performance when known. */
  lines: z.array(z.object({ scene: z.number().int(), text: z.string().max(4000), emotion: DialogueEmotionSchema.nullable().default(null), intensity: z.number().nullable().default(null), intention: z.string().max(200).nullable().default(null) })).max(3000).default([]),
  /** Action sentences that name them. */
  mentions: z.array(z.object({ scene: z.number().int(), text: z.string().max(2000) })).max(1000).default([]),
  /** Scenes they appear in, in order. */
  scenes: z.array(z.object({ number: z.number().int(), heading: z.string().max(300) })).max(1000).default([]),
  total_scenes: z.number().int().min(0).default(0),
  relationships: z.array(z.object({ other: z.string().max(120), type: z.string().max(60), description: z.string().max(1000).nullable().default(null) })).max(100).default([]),
  accent: z.object({ accent: z.string().max(120), languages: z.array(z.string().max(60)).max(10), evidence: z.array(z.string().max(300)).max(10).default([]) }).nullable().default(null),
  project: z.object({ logline: z.string().max(1000).nullable().default(null), genre: z.string().max(100).nullable().default(null), setting: z.string().max(300).nullable().default(null), time_period: z.string().max(100).nullable().default(null) }).default({}),
});
export type CharacterProfileInput = z.input<typeof CharacterProfileInputSchema>;

/** Only the fields there is something to say about; limits match CharacterProfileFieldsSchema. */
export const CharacterProfileOutputSchema = z.object({
  fields: z.object({
    age: z.string().max(40), gender: z.string().max(60), nationality: z.string().max(100), occupation: z.string().max(150), description: z.string().max(2000), accent: z.string().max(120), languages: z.string().max(200),
    personality: z.string().max(4000), backstory: z.string().max(8000), motivation: z.string().max(2000), fears: z.string().max(2000), strengths: z.string().max(2000), weaknesses: z.string().max(2000), arc: z.string().max(4000),
  }).partial(),
  evidence: z.record(z.string(), z.string().max(300)),
  engine_version: z.string(),
});
export type CharacterProfileOutput = z.infer<typeof CharacterProfileOutputSchema>;
