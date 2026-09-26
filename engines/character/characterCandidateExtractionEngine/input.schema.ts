import { z } from "zod";
import { ScreenplayElementSchema } from "@aurastage/contracts";

export const CharacterExtractionInputSchema = z.object({
  /** Elements of one exact (approved) script version. */
  elements: z.array(ScreenplayElementSchema),
  /** Scene boundaries for that same version (from story.sceneBoundaryEngine). */
  scenes: z.array(
    z.object({
      number: z.number().int().positive(),
      element_start: z.number().int().nonnegative(),
      element_end: z.number().int().nonnegative(),
    })
  ),
});
export type CharacterExtractionInput = z.infer<typeof CharacterExtractionInputSchema>;
