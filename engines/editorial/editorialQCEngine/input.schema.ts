import { z } from "zod";
import { EngineClipSchema } from "../timeline";

export const EditorialQCInputSchema = z.object({
  fps: z.number().int().min(1).max(120),
  clips: z.array(EngineClipSchema),
  scenes: z.array(z.object({ scene_id: z.string().uuid(), number: z.number().int(), heading: z.string() })),
  /** Upstream problems found by the caller for specific clips (e.g. take no longer approved). */
  issues: z.array(z.object({ clip_id: z.string().uuid(), code: z.string(), message: z.string() })),
  target_runtime_minutes: z.number().positive().nullable(),
});
export type EditorialQCInput = z.infer<typeof EditorialQCInputSchema>;
