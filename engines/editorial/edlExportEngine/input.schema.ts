import { z } from "zod";
import { EngineClipSchema } from "../timeline";

export const EdlExportInputSchema = z.object({
  title: z.string().min(1).max(200),
  fps: z.number().int().min(1).max(120),
  clips: z.array(EngineClipSchema),
});
export type EdlExportInput = z.infer<typeof EdlExportInputSchema>;
