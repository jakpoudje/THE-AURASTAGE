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
