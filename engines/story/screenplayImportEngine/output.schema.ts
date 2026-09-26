import { z } from "zod";

export const ImportFormatSchema = z.enum(["fdx", "fountain"]);

export const ScreenplayImportOutputSchema = z.object({
  /** Fountain-style text, ready for story.screenplayFormatEngine. */
  source_text: z.string(),
  format: ImportFormatSchema,
  /** Plain-language notes about anything that could not be carried over exactly. */
  warnings: z.array(z.string()),
  engine_version: z.string(),
});
export type ScreenplayImportOutput = z.infer<typeof ScreenplayImportOutputSchema>;
