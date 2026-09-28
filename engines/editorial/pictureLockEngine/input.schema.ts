import { z } from "zod";
import { EngineClipSchema } from "../timeline";

export const PictureLockInputSchema = z.object({
  fps: z.number().int().min(1).max(120),
  /** The clips of the locked version, and the timeline as it would be after the change. */
  locked: z.array(EngineClipSchema),
  proposed: z.array(EngineClipSchema),
  scenes: z.array(z.object({ scene_id: z.string().uuid(), number: z.number().int(), heading: z.string() })),
});
export type PictureLockInput = z.infer<typeof PictureLockInputSchema>;
