import { z } from "zod";

export const VoiceprintSchema = z.object({
  speaker_key: z.string(),
  speaker_name: z.string(),
  lines: z.number().int(),
  words: z.number().int(),
  avg_words_per_line: z.number(),
  question_rate: z.number(),
  exclamation_rate: z.number(),
  /** Distinct words / total words (0–1). Higher = more varied vocabulary. */
  vocabulary_variety: z.number(),
  /** Words this speaker uses notably more than everyone else. */
  distinctive_words: z.array(z.string()),
  repeated_phrases: z.array(z.object({ phrase: z.string(), count: z.number().int(), scenes: z.array(z.number().int()) })),
  repeated_lines: z.array(z.object({ text: z.string(), count: z.number().int() })),
});
export type Voiceprint = z.infer<typeof VoiceprintSchema>;

export const VoiceprintOutputSchema = z.object({
  voiceprints: z.array(VoiceprintSchema),
  engine_version: z.string(),
});
export type VoiceprintOutput = z.infer<typeof VoiceprintOutputSchema>;
