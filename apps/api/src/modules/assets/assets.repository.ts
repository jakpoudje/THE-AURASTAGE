// apps/api/src/modules/assets/assets.repository.ts
// Canonical persistence for Asset / AssetVersion / AssetLink. Writes only via register_asset (0015) and
// update_asset / add_asset_version / set_asset_link (0024), all gated. Reads other domains read-only for usage.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssetConflictError, AssetNotFoundError, AssetValidationError } from "./assets.validator";
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

// ---- Assets Library (migration 0024) ----
async function rows(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Row[];
}
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-AST-\d+:\s*/, "");
  if (msg.startsWith("AURA-AST-409")) return new AssetConflictError(text);
  if (msg.startsWith("AURA-AST-404")) return new AssetNotFoundError(text);
  if (msg.startsWith("AURA-AST-403") || error.code === "42501") return new AssetForbiddenError(colForbiddenMessage(error));
  if (msg.startsWith("AURA-AST-400") || error.code === "23514") return new AssetValidationError(text || "That value isn't allowed");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rpc<T = Row>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}
export const listAllAssets = (db: SupabaseClient, projectId: string) =>
  rows(db.from("assets").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(2000));
export const listVersions = (db: SupabaseClient, assetId: string) =>
  rows(db.from("asset_versions").select("id, version_number, checksum, metadata, note, created_by, created_at").eq("asset_id", assetId).order("version_number", { ascending: false }));
export async function getVersion(db: SupabaseClient, assetId: string, n: number) {
  const { data, error } = await db.from("asset_versions").select("*").eq("asset_id", assetId).eq("version_number", n).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Row | null;
}
export const versionCounts = (db: SupabaseClient, projectId: string) => rows(db.from("asset_versions").select("asset_id").eq("project_id", projectId));
export const listLinks = (db: SupabaseClient, projectId: string) => rows(db.from("asset_links").select("asset_id, object_type, object_id").eq("project_id", projectId));
export const listAssetClips = (db: SupabaseClient, projectId: string) =>
  rows(db.from("audio_clips").select("asset_id, session_id, label").eq("project_id", projectId).not("asset_id", "is", null));
/** Music on the cut's A2 track (Editorial owns it; read-only here, migration 0045). */
export const listTimelineMusic = (db: SupabaseClient, projectId: string) =>
  rows(db.from("timeline_clips").select("asset_id, label, record_in").eq("project_id", projectId).not("asset_id", "is", null));
export const listSessions = (db: SupabaseClient, projectId: string) => rows(db.from("audio_sessions").select("id, scene_id").eq("project_id", projectId));
export const listScenes = (db: SupabaseClient, projectId: string) =>
  rows(db.from("scenes").select("id, number, heading").eq("project_id", projectId).order("number", { ascending: true }));
/** Location and prop names for usage labels (read-only; the Locations & Props domain owns them). */
/** Reference views made into this library (Casting and Locations & Props), read-only here. */
export const listReferenceUses = async (db: SupabaseClient, projectId: string) => ({
  characters: await rows(db.from("character_reference_images").select("asset_id, character_id, angle, size").eq("project_id", projectId).eq("status", "succeeded").not("asset_id", "is", null)),
  world: await rows(db.from("world_reference_images").select("asset_id, object_type, object_id, view_key").eq("project_id", projectId).eq("status", "succeeded").not("asset_id", "is", null)),
});
export const listWorldNames = async (db: SupabaseClient, projectId: string) => [
  ...(await rows(db.from("locations").select("id, name").eq("project_id", projectId))).map((r: any) => ({ ...r, kind: "location" as const })),
  ...(await rows(db.from("props").select("id, name").eq("project_id", projectId))).map((r: any) => ({ ...r, kind: "prop" as const })),
];
export const listCharacters = (db: SupabaseClient, projectId: string) =>
  rows(db.from("characters").select("id, name, status").eq("project_id", projectId).order("name", { ascending: true }));
export const listRenderSources = (db: SupabaseClient, projectId: string) =>
  rows(db.from("renders").select("id, profile_id, lock_number, status, asset_ids:manifest->sources->asset_ids").eq("project_id", projectId).neq("status", "cancelled"));
export const listHistory = (db: SupabaseClient, assetId: string) =>
  rows(db.from("audit_events").select("action, metadata, actor_id, created_at").eq("object_type", "Asset").eq("object_id", assetId).order("created_at", { ascending: false }).limit(50));
export const deleteAsset = (db: SupabaseClient, id: string, confirm: boolean) =>
  rpc<{ name: string; storage_paths: string[] }>(db, "delete_asset", { p_asset: id, p_confirm: confirm });
export const updateAsset = (db: SupabaseClient, id: string, patch: Row) => rpc(db, "update_asset", { p_asset: id, p_patch: patch });
export const addVersion = (db: SupabaseClient, a: { assetId: string; path: string; checksum: string; metadata: Row; note: string }) =>
  rpc(db, "add_asset_version", { p_asset: a.assetId, p_storage_path: a.path, p_checksum: a.checksum, p_metadata: a.metadata, p_note: a.note });
export const setLink = (db: SupabaseClient, id: string, type: string, objectId: string, linked: boolean) =>
  rpc<number>(db, "set_asset_link", { p_asset: id, p_object_type: type, p_object_id: objectId, p_linked: linked });
