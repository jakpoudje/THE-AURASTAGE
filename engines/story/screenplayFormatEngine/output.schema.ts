import { z } from "zod";
import { ScreenplayElementSchema } from "@aurastage/contracts";

export const ScreenplayFormatOutputSchema = z.object({
  elements: z.array(ScreenplayElementSchema),
  engine_version: z.string(),
});
export type ScreenplayFormatOutput = z.infer<typeof ScreenplayFormatOutputSchema>;
