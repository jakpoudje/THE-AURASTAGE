import { z } from "zod";

export const AssetCatalogOutputSchema = z.object({
  /** Matching asset ids in display order. */
  ids: z.array(z.string().uuid()),
  /** Counts per category over everything else the query selects (so the tabs show what a click would give). */
  category_counts: z.record(z.number().int()),
  type_counts: z.record(z.number().int()),
  total: z.number().int(),
  engine_version: z.string(),
});
export type AssetCatalogOutput = z.infer<typeof AssetCatalogOutputSchema>;
