import { z } from "zod";

export const StageStateSchema = z.enum(["not_started", "waiting", "in_progress", "needs_review", "complete"]);
export const OverviewCheckSchema = z.object({ label: z.string(), ok: z.boolean(), evidence: z.string() });
export const OverviewStageSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  label: z.string(),
  href: z.string(),
  state: StageStateSchema,
  /** Real counts only; null when the stage has nothing countable yet. Never a made-up percentage. */
  done: z.number().int().nullable(),
  total: z.number().int().nullable(),
  unit: z.string(),
  summary: z.string(),
  checks: z.array(OverviewCheckSchema),
  next_step: z.string().nullable(),
});
export const ProductionOverviewOutputSchema = z.object({
  stages: z.array(OverviewStageSchema),
  complete: z.number().int(),
  attention: z.array(z.object({ stage: z.string(), label: z.string(), href: z.string() })),
  next: z.object({ stage: z.string(), label: z.string(), href: z.string() }).nullable(),
  engine_version: z.string(),
});
export type OverviewStage = z.infer<typeof OverviewStageSchema>;
export type ProductionOverviewOutput = z.infer<typeof ProductionOverviewOutputSchema>;
