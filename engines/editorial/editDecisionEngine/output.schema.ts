import { z } from "zod";
import { EngineClipSchema } from "../timeline";

export const EditDecisionOutputSchema = z.object({
  clips: z.array(EngineClipSchema),
  /** Plain-language summary of what changed. */
  summary: z.string(),
  engine_version: z.string(),
});
export type EditDecisionOutput = z.infer<typeof EditDecisionOutputSchema>;
