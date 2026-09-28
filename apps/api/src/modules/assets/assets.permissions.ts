// apps/api/src/modules/assets/assets.permissions.ts
// Domain: Assets Library. RLS guards reads; register_asset re-checks membership.
import type { SupabaseClient } from "@supabase/supabase-js";

export class AssetForbiddenError extends Error {
  code = "AURA-AST-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assertProjectAccess(db: SupabaseClient, projectId: string) {
  if (!UUID_RE.test(projectId)) throw new AssetForbiddenError();
  const { data, error } = await db.from("projects").select("id, org_id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AssetForbiddenError();
  return data as { id: string; org_id: string };
}
export async function assertAssetAccess(db: SupabaseClient, assetId: string) {
  if (!UUID_RE.test(assetId)) throw new AssetForbiddenError();
  const { data, error } = await db.from("assets").select("*").eq("id", assetId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AssetForbiddenError();
  return data as Record<string, any>;
}
