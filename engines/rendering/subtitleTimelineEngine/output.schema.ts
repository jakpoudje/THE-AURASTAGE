import { z } from "zod";

export const SubtitleCueSchema = z.object({ index: z.number().int(), start_frame: z.number().int(), end_frame: z.number().int(), text: z.string(), line_id: z.string() });
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;
export const SubtitleOutputSchema = z.object({
  cues: z.array(SubtitleCueSchema),
  srt: z.string(),
  vtt: z.string(),
  /** Readability notes (reading speed, very short cues) with timecodes. */
  warnings: z.array(z.string()),
  engine_version: z.string(),
});
export type SubtitleOutput = z.infer<typeof SubtitleOutputSchema>;
