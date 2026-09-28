import { z } from "zod";
import { AssetUsageSchema } from "@aurastage/contracts";

export const CatalogAssetSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  archived: z.boolean().default(false),
  created_at: z.string(),
  usage: z.array(AssetUsageSchema).default([]),
});
export type CatalogAsset = z.infer<typeof CatalogAssetSchema>;

export const CatalogQuerySchema = z
  .object({
    q: z.string().max(200).default(""),
    category: z.string().nullable().default(null),
    type: z.string().nullable().default(null),
    usage: z.enum(["any", "used", "unused"]).default("any"),
    scene_id: z.string().uuid().nullable().default(null),
    archived: z.boolean().default(false),
    sort: z.enum(["newest", "name"]).default("newest"),
  })
  .default({});
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

export const AssetCatalogInputSchema = z.object({ assets: z.array(CatalogAssetSchema), query: CatalogQuerySchema });
export type AssetCatalogInput = z.input<typeof AssetCatalogInputSchema>;
