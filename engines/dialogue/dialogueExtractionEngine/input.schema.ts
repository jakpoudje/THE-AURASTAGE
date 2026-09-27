import { z } from "zod";
import { ScreenplayElementSchema } from "@aurastage/contracts";

export const DialogueExtractionInputSchema = z.object({
  elements: z.array(ScreenplayElementSchema),
  scenes: z.array(
    z.object({
      number: z.number().int().positive(),
      element_start: z.number().int().nonnegative(),
      element_end: z.number().int().nonnegative(),
    })
  ),
});
export type DialogueExtractionInput = z.infer<typeof DialogueExtractionInputSchema>;
