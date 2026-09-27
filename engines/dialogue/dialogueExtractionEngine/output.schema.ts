import { z } from "zod";

export const ExtractedLineSchema = z.object({
  scene_number: z.number().int().positive(),
  /** 1-based position within the scene. */
  ordinal: z.number().int().positive(),
  /** Cue name as written, extensions removed (e.g. "TUNDE"). */
  speaker_name: z.string(),
  /** normalizeCharacterName(speaker_name) — used to resolve the canonical character. */
  speaker_key: z.string(),
  extensions: z.array(z.string()),
  parenthetical: z.string().nullable(),
  text: z.string(),
  /** Identity of the words spoken (speaker + normalised text), for carrying annotations across versions. */
  text_hash: z.string(),
  /** Index of the character cue element in the source version (evidence link). */
  element_index: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  word_count: z.number().int().nonnegative(),
  estimated_seconds: z.number().nonnegative(),
});
export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;

export const DialogueExtractionOutputSchema = z.object({
  lines: z.array(ExtractedLineSchema),
  engine_version: z.string(),
});
export type DialogueExtractionOutput = z.infer<typeof DialogueExtractionOutputSchema>;
