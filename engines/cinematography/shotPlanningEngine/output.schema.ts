import { z } from "zod";
import { ShotEditableSchema } from "@aurastage/contracts";

export const ShotPlanningOutputSchema = z.object({
  shots: z.array(ShotEditableSchema.extend({ rationale: z.string() })),
  scene_seconds: z.number(),
  engine_version: z.string(),
});
export type ShotPlanningOutput = z.infer<typeof ShotPlanningOutputSchema>;
export type ProposedShot = ShotPlanningOutput["shots"][number];
