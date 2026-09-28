import { z } from "zod";
import { EngineClipSchema } from "../timeline";

export const AssemblyOutputSchema = z.object({
  clips: z.array(EngineClipSchema),
  /** Why each cut is where it is (one line per picture clip). */
  rationale: z.array(z.string()),
  duration_frames: z.number().int(),
  engine_version: z.string(),
});
export type AssemblyOutput = z.infer<typeof AssemblyOutputSchema>;
