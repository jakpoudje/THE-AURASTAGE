import { z } from "zod";
import { ShotPurposeSchema } from "@aurastage/contracts";

export const CoverageInputSchema = z.object({
  /** Intended scene story time Tₛ in seconds. */
  scene_seconds: z.number().positive(),
  shots: z.array(
    z.object({
      id: z.string(),
      ordinal: z.number().int(),
      purpose: ShotPurposeSchema,
      duration_seconds: z.number().positive(),
      story_start: z.number().nonnegative(),
      story_end: z.number().nonnegative(),
      character_ids: z.array(z.string()),
      dialogue_line_ids: z.array(z.string()),
    })
  ),
  /** Mandatory beats: every dialogue line of the locked Scene DNA. */
  line_ids: z.array(z.string()),
  line_labels: z.record(z.string(), z.string()).default({}),
  /** On-screen characters of the locked Scene DNA. */
  characters: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type CoverageInput = z.input<typeof CoverageInputSchema>;
