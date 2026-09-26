import { z } from "zod";
import { ProjectTypeSchema } from "@aurastage/contracts";

export const RuntimeScopeInputSchema = z.object({
  target_runtime_minutes: z.number().int().min(1).max(600),
  genre: z.string().nullable().optional(),
  type: ProjectTypeSchema.optional(),
  /** Optional user override of the mean scene length (SRS §5.1: the user may override all recommendations). */
  mean_scene_minutes_override: z.number().positive().max(30).optional(),
});
export type RuntimeScopeInput = z.infer<typeof RuntimeScopeInputSchema>;
