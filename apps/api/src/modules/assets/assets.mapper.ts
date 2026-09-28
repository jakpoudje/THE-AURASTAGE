// apps/api/src/modules/assets/assets.mapper.ts
type Row = Record<string, any>;
export const toAssetDTO = (r: Row) => ({
  id: r.id as string,
  project_id: r.project_id as string,
  type: r.type as string,
  name: r.name as string,
  checksum: (r.checksum ?? null) as string | null,
  media_type: (r.metadata?.media_type ?? null) as string | null,
  size_bytes: (r.metadata?.size_bytes ?? null) as number | null,
  duration_seconds: (r.metadata?.duration_seconds ?? null) as number | null,
  created_at: r.created_at as string,
});
export type AssetDTO = ReturnType<typeof toAssetDTO>;
