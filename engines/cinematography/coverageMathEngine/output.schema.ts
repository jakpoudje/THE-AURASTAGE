import { z } from "zod";
import { ReadinessPredicateSchema } from "@aurastage/contracts";

export const CoverageOutputSchema = z.object({
  /** C = |∪ planned story intervals ∩ [0,Tₛ]| / Tₛ, in [0,1]. */
  coverage: z.number().min(0).max(1),
  covered_seconds: z.number(),
  gaps: z.array(z.object({ start: z.number(), end: z.number() })),
  uncovered_lines: z.array(z.string()),
  unseen_characters: z.array(z.string()),
  screen_seconds: z.number(),
  shot_count: z.number().int(),
  readiness: z.array(ReadinessPredicateSchema),
  ready_for_approval: z.boolean(),
  engine_version: z.string(),
});
export type CoverageOutput = z.infer<typeof CoverageOutputSchema>;
