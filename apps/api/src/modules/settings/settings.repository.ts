// Project Settings persistence: writes only through save_project_settings (migration 0023).
import type { SupabaseClient } from "@supabase/supabase-js";
import { colForbiddenMessage } from "../../infrastructure/permissions";
import { SettingsConflictError, SettingsForbiddenError, SettingsNotFoundError } from "./settings.validator";

type Row = Record<string, any>;
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-SET-\d+:\s*/, "");
  if (msg.startsWith("AURA-SET-409")) return new SettingsConflictError(text);
  if (msg.startsWith("AURA-SET-404")) return new SettingsNotFoundError(text);
  if (msg.startsWith("AURA-COL-403") || error.code === "42501") return new SettingsForbiddenError(colForbiddenMessage(error) ?? "Not allowed");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rows(q: PromiseLike<{ data: unknown[] | null; error: any }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}

export const getProject = async (db: SupabaseClient, id: string) =>
  (await rows(db.from("projects").select("id, title, type, genre, subgenre, setting, time_period, logline, synopsis, target_runtime_minutes, tone").eq("id", id)))[0] ?? null;
export const listVersions = (db: SupabaseClient, projectId: string) =>
  rows(db.from("project_settings_versions").select("version_number, changed, created_at").eq("project_id", projectId).order("version_number", { ascending: false }).limit(20));
export async function save(db: SupabaseClient, projectId: string, baseRevision: string | null, settings: Row, changed: string[]) {
  const { data, error } = await db.rpc("save_project_settings", { p_project: projectId, p_base_revision: baseRevision, p_settings: settings, p_changed: changed });
  if (error) throw mapDbError(error);
  return data as Row;
}
export async function paidTakesThisMonth(db: SupabaseClient, projectId: string) {
  const { data, error } = await db.rpc("paid_takes_this_month", { p_project: projectId });
  if (error) throw mapDbError(error);
  return Number(data ?? 0);
}
// Read-only counts for the impact preview (other domains' tables, through the caller's own access).
export async function count(db: SupabaseClient, table: string, projectId: string, filters: Record<string, string> = {}) {
  let q = db.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count: n, error } = await q;
  if (error) throw mapDbError(error);
  return n ?? 0;
}
