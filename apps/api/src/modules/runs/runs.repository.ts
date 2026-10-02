// apps/api/src/modules/runs/runs.repository.ts
// Canonical persistence for production runs (migration 0056): reads through RLS, writes only through its functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { colForbiddenMessage } from "../../infrastructure/permissions";
import { RunForbiddenError, RunNotFoundError, RunValidationError } from "./runs.errors";

type Row = Record<string, any>;
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-[A-Z]+-\d+:\s*/, "");
  if (msg.startsWith("AURA-RUN-404")) return new RunNotFoundError(text);
  if (msg.startsWith("AURA-RUN-400")) return new RunValidationError(text);
  if (msg.startsWith("AURA-COL-403") || error.code === "42501") return new RunForbiddenError(colForbiddenMessage(error));
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rpc<T = Row>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

export async function listRuns(db: SupabaseClient, projectId: string, limit = 8) {
  const { data, error } = await db.from("production_runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as Row[];
}
export async function getRun(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("production_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}
export const startRun = (db: SupabaseClient, projectId: string, kind: string, sceneId: string | null) =>
  rpc<{ run: Row; joined: boolean }>(db, "start_production_run", { p_project: projectId, p_kind: kind, p_scene: sceneId });
export const leaseRun = (db: SupabaseClient, id: string, seconds: number) => rpc<boolean>(db, "lease_production_run", { p_run: id, p_seconds: seconds });
export const saveRun = (db: SupabaseClient, id: string, a: { phase: string; status: string; message: string; progress: Row; log: string | null }) =>
  rpc<Row>(db, "save_production_run", { p_run: id, p_phase: a.phase, p_status: a.status, p_message: a.message, p_progress: a.progress, p_log: a.log });
export const controlRun = (db: SupabaseClient, id: string, action: string) => rpc<Row>(db, "control_production_run", { p_run: id, p_action: action });
