import { z } from "zod";

export const PROCEDURAL_KINDS = ["ambience", "fx", "foley", "score"] as const;
export const ProceduralAudioInputSchema = z.object({
  kind: z.enum(PROCEDURAL_KINDS),
  /** The cue in words, e.g. "Exterior lagos harbour ambience — rain, dawn" or "door slams". */
  description: z.string().trim().min(1).max(500),
  duration_seconds: z.number().min(0.2).max(300),
  /** Scene DNA mood words steer the score and the ambience level. */
  mood: z.array(z.string().max(40)).max(8).default([]),
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(1),
  sample_rate: z.union([z.literal(44100), z.literal(48000)]).default(48000),
}).strict();
export type ProceduralAudioInput = z.infer<typeof ProceduralAudioInputSchema>;
