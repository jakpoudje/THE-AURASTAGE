// Ask AuraStage persistence: ai_proposals, written only through the functions of migration 0025.
import type { SupabaseClient } from "@supabase/supabase-js";
import { colForbiddenMessage } from "../../infrastructure/permissions";
import { AssistantError } from "./assistant.errors";

type Row = Record<string, any>;
const STATUS: Record<string, number> = { "400": 400, "403": 403, "404": 404, "409": 409, "429": 429 };
export function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const m = msg.match(/^AURA-AI-(\d{3}):\s*(.*)$/s);
  if (m) return new AssistantError(STATUS[m[1]] ?? 400, `AURA-AI-${m[1]}`, m[2]);
  const col = colForbiddenMessage(error);
  if (col || error.code === "42501") return new AssistantError(403, "AURA-AI-403", col ?? "Not allowed");
  if (msg.startsWith("AURA-COL-404")) return new AssistantError(404, "AURA-AI-404", "Project not found");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rows(q: PromiseLike<{ data: unknown; error: any }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}
const LIST_COLS = "id, project_id, module, object_type, object_id, request, mode, intent, status, provider, model, engine_version, test_output, plan, results, error, created_by, created_at, planned_at, applied_at, undone_at";

export const getProject = async (db: SupabaseClient, id: string) => (await rows(db.from("projects").select("id, org_id, title").eq("id", id)))[0] ?? null;
export async function access(db: SupabaseClient, projectId: string): Promise<{ modules: Record<string, string[]> }> {
  const { data, error } = await db.rpc("project_access", { p_project: projectId });
  if (error) throw mapDbError(error);
  return data as { modules: Record<string, string[]> };
}
export async function request(db: SupabaseClient, a: { project: string; module: string; object: { type: string; id: string; version: string | null } | null; text: string; mode: string; intent: unknown; snapshot: unknown; engineVersion: string }) {
  const { data, error } = await db.rpc("request_ai_proposal", {
    p_project: a.project, p_module: a.module, p_object_type: a.object?.type ?? null, p_object_id: a.object?.id ?? null, p_object_version: a.object?.version ?? null,
    p_request: a.text, p_mode: a.mode, p_intent: a.intent, p_snapshot: a.snapshot, p_engine_version: a.engineVersion,
  });
  if (error) throw mapDbError(error);
  return data as Row;
}
export const get = async (db: SupabaseClient, id: string) => (await rows(db.from("ai_proposals").select(`${LIST_COLS}, snapshot`).eq("id", id)))[0] ?? null;
export const list = (db: SupabaseClient, projectId: string) =>
  rows(db.from("ai_proposals").select(LIST_COLS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(20));
export async function outcome(db: SupabaseClient, id: string, status: string, results: unknown = null, err: string | null = null) {
  const { data, error } = await db.rpc("set_ai_proposal_outcome", { p_id: id, p_status: status, p_results: results, p_error: err });
  if (error) throw mapDbError(error);
  return data as Row;
}
