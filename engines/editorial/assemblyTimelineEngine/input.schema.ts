import { z } from "zod";

const id = z.string().uuid();
export const AssemblyInputSchema = z.object({
  fps: z.number().int().min(1).max(120),
  scenes: z.array(
    z.object({
      scene_id: id,
      number: z.number().int(),
      heading: z.string(),
      /** Shots of the scene's APPROVED shot plan version, with their story-time span (seconds). */
      shots: z.array(
        z.object({
          shot_id: id,
          ordinal: z.number().int(),
          size: z.string().nullable().optional(),
          story_start: z.number().min(0),
          story_end: z.number().min(0),
          /** The approved take for this shot, if any. duration_seconds is null for a still image. */
          take: z.object({ take_id: id, duration_seconds: z.number().positive().nullable() }).nullable(),
        })
      ),
      /** The scene's approved mix (Audio Studio), if any. */
      audio: z.object({ audio_session_version_id: id, version_number: z.number().int(), scene_seconds: z.number().positive() }).nullable(),
    })
  ),
});
export type AssemblyInput = z.infer<typeof AssemblyInputSchema>;
