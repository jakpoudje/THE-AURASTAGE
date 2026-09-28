import { z } from "zod";

// Canonical owner: Assets Library (see docs/architecture/DATA_AUTHORITY.md).
// Master bytes stored once; every other domain references AssetVersion IDs.

export const AssetSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  type: z.string(),
  name: z.string(),
  storage_path: z.string().nullable().optional(),
  checksum: z.string().nullable().optional(),
  metadata: z.record(z.unknown()),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

// ---- Assets Library (migration 0024) ----
export const ASSET_CATEGORIES = [
  { id: "characters", label: "Characters" },
  { id: "locations", label: "Locations" },
  { id: "props", label: "Props" },
  { id: "wardrobe", label: "Costumes & Wardrobe" },
  { id: "vehicles", label: "Vehicles" },
  { id: "environments", label: "Environments" },
  { id: "visual_references", label: "Visual References" },
  { id: "audio", label: "Audio" },
  { id: "music_sound", label: "Music & Sound" },
  { id: "documents", label: "Documents" },
  { id: "graphics_titles", label: "Graphics & Titles" },
  { id: "luts_presets", label: "LUTs & Presets" },
] as const;
export const AssetCategorySchema = z.enum(ASSET_CATEGORIES.map((c) => c.id) as [string, ...string[]]);
export type AssetCategory = z.infer<typeof AssetCategorySchema>;

export const AssetTypeSchema = z.enum(["audio", "image", "video", "document", "reference"]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const UpdateAssetInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: AssetCategorySchema,
    description: z.string().max(4000),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    archived: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");
export type UpdateAssetInput = z.infer<typeof UpdateAssetInputSchema>;

export const AssetLinkInputSchema = z
  .object({ object_type: z.enum(["scene", "character"]), object_id: z.string().uuid(), linked: z.boolean().default(true) })
  .strict();
export type AssetLinkInput = z.infer<typeof AssetLinkInputSchema>;

/** Where an asset is used, each with the evidence it came from. */
export const AssetUsageSchema = z.object({
  kind: z.enum(["audio_clip", "render", "link"]),
  scene_id: z.string().uuid().nullable(),
  label: z.string(),
  href: z.string().nullable(),
});
export type AssetUsage = z.infer<typeof AssetUsageSchema>;
