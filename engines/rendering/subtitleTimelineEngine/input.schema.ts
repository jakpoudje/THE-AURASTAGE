import { z } from "zod";

export const SubtitleInputSchema = z.object({
  fps: z.number().int().min(1).max(120),
  /** A1 clips of the locked cut (frames). */
  audio: z.array(z.object({ record_in: z.number().int(), duration: z.number().int().min(1), source_in: z.number().int().min(0), mix_version_id: z.string() })),
  /** Dialogue clips of each approved mix (seconds, scene time). */
  mixes: z.record(z.object({ dialogue: z.array(z.object({ line_id: z.string(), start_seconds: z.number(), duration_seconds: z.number().positive() })) })),
  lines: z.record(z.object({ speaker: z.string(), text: z.string() })),
});
export type SubtitleInput = z.infer<typeof SubtitleInputSchema>;
