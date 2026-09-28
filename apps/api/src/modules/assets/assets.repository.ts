// apps/api/src/modules/assets/assets.repository.ts
// Canonical persistence for Asset. Writes only via register_asset (migration 0015).
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssetValidationError } from "./assets.validator";
import { AssetForbiddenError } from "./assets.permissions";
import { colForbiddenMessage } from "../../infrastructure/permissions";

type Row = Record<string, any>;
export async function registerAsset(db: SupabaseClient, a: { projectId: string; type: string; name: string; path: string; checksum: string; metadata: Row }) {
  const { data, error } = await db.rpc("register_asset", {
    p_project_id: a.projectId, p_type: a.type, p_name: a.name, p_storage_path: a.path, p_checksum: a.checksum, p_metadata: a.metadata,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("AURA-AST-403") || error.code === "42501") throw new AssetForbiddenError(colForbiddenMessage(error));
    if (msg.startsWith("AURA-AST-400")) throw new AssetValidationError(msg.replace(/^AURA-AST-\d+:\s*/, ""));
    throw Object.assign(new Error(msg || "Database error"), { cause: error });
  }
  return data as Row;
}
export async function listAssets(db: SupabaseClient, projectId: string, type: string | null) {
  let q = db.from("assets").select("*").eq("project_id", projectId);
  if (type) q = q.eq("type", type);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
}
