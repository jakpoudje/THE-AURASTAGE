import { z } from "zod";

export const RECORDED_KINDS = ["ambience", "fx", "foley"] as const;
/** One recording in the built-in library (from its catalogue; the samples are passed separately to render). */
export const LibraryClipSchema = z.object({
  id: z.string().min(1).max(120),
  category: z.string().min(1).max(40),
  seconds: z.number().positive().max(600),
});
export const RecordedSoundInputSchema = z.object({
  kind: z.enum(RECORDED_KINDS),
  description: z.string().trim().min(1).max(500),
  duration_seconds: z.number().min(0.2).max(300),
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(1),
  library: z.array(LibraryClipSchema).max(2000),
}).strict();
export type RecordedSoundInput = z.infer<typeof RecordedSoundInputSchema>;
export type LibraryClip = z.infer<typeof LibraryClipSchema>;
