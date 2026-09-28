import { z } from "zod";
import { AudioFamilySchema } from "@aurastage/contracts";

export const AudioSpottingOutputSchema = z.object({
  tracks: z.array(z.object({ key: z.string(), name: z.string(), family: AudioFamilySchema })),
  clips: z.array(
    z.object({
      track_key: z.string(),
      label: z.string(),
      start_seconds: z.number().nonnegative(),
      duration_seconds: z.number().positive(),
      source: z.object({ dialogue_line_id: z.string().optional(), cue: z.string().optional(), evidence: z.string() }),
    })
  ),
  scene_seconds: z.number(),
  engine_version: z.string(),
});
export type AudioSpottingOutput = z.infer<typeof AudioSpottingOutputSchema>;
