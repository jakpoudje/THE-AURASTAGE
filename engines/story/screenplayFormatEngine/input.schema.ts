import { z } from "zod";

export const ScreenplayFormatInputSchema = z.object({
  /** Screenplay source in Fountain-style plain text. */
  source_text: z.string(),
});
export type ScreenplayFormatInput = z.infer<typeof ScreenplayFormatInputSchema>;
