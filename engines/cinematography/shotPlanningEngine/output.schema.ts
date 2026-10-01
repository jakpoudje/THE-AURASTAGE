import { z } from "zod";
import { ShotEditableSchema } from "@aurastage/contracts";

export const ShotPlanningOutputSchema = z.object({
  shots: z.array(ShotEditableSchema.extend({ rationale: z.string() })),
  scene_seconds: z.number(),
  engine_version: z.string(),
  /** What the camera intelligence decided for this scene and why (1.3.0). */
  camera: z.object({ genre_family: z.string(), scene_kind: z.string(), cue: z.string().nullable(), decisions: z.array(z.string()) }),
});
export type ShotPlanningOutput = z.infer<typeof ShotPlanningOutputSchema>;
export type ProposedShot = ShotPlanningOutput["shots"][number];
