import { z } from "zod";
import { AudioFamilySchema, SessionMixSchema, TrackFxSchema } from "@aurastage/contracts";

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
  /** 1.3.0: the scene's acoustic space and the dialogue/background strips for it (sceneAcousticsEngine). */
  acoustics: z.object({
    space: z.object({ id: z.string(), name: z.string(), reverb: SessionMixSchema.shape.reverb }),
    why: z.array(z.string()),
    dx_fx: TrackFxSchema,
    bg_fx: TrackFxSchema,
  }),
  engine_version: z.string(),
});
export type AudioSpottingOutput = z.infer<typeof AudioSpottingOutputSchema>;
