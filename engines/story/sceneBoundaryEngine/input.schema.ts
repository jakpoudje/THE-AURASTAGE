import { z } from "zod";
import { ScreenplayElementSchema } from "@aurastage/contracts";

export const SceneBoundaryInputSchema = z.object({
  elements: z.array(ScreenplayElementSchema),
});
export type SceneBoundaryInput = z.infer<typeof SceneBoundaryInputSchema>;
