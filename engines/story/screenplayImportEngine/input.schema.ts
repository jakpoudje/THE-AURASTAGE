import { z } from "zod";

export const ScreenplayImportInputSchema = z.object({
  file_name: z.string().min(1).max(255),
  /** The file's text content (UTF-8). Binary formats such as PDF are not accepted here. */
  content: z.string().max(5_000_000),
});
export type ScreenplayImportInput = z.infer<typeof ScreenplayImportInputSchema>;
