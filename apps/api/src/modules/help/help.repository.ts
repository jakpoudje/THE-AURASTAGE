// Help & Support persistence. Reads other domains' tables read-only through RLS (the caller's own
// access), writes only its own tickets through the migration-0022 functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { HelpForbiddenError, HelpNotFoundError, HelpRateLimitError, HelpValidationError } from "./help.validator";

type Row = Record<string, any>;
function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-HLP-\d+:\s*/, "");
  if (msg.startsWith("AURA-HLP-404")) return new HelpNotFoundError(text);
  if (msg.startsWith("AURA-HLP-429")) return new HelpRateLimitError(text);
  if (msg.startsWith("AURA-HLP-40") || error.code === "42501") return new HelpForbiddenError(msg.startsWith("AURA-HLP") ? text : "Not allowed");
  if (error.code === "23514") return new HelpValidationError([], "That value isn't allowed");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
async function rpc<T>(db: SupabaseClient, fn: string, args: Row = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}
async function rows(q: PromiseLike<{ data: unknown[] | null; error: any }>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}

export const platformStatus = (db: SupabaseClient) => rpc<Row>(db, "platform_status");
export async function pingDatabase(db: SupabaseClient) {
  const t = Date.now();
  const { error } = await db.from("project_roles").select("id", { count: "exact", head: true });
  return { ok: !error, ms: Date.now() - t, error: error?.message ?? null };
}
export const isStaff = (db: SupabaseClient) => rpc<boolean>(db, "is_platform_staff");
export const listTickets = (db: SupabaseClient, all: boolean) => rpc<Row[]>(db, "list_tickets", { p_all: all });
export const createTicket = (db: SupabaseClient, t: { project_id: string | null; module: string | null; subject: string; body: string; consent: boolean; diagnostics: Row | null }) =>
  rpc<Row>(db, "create_ticket", { p_project: t.project_id, p_module: t.module, p_subject: t.subject, p_body: t.body, p_consent: t.consent, p_diagnostics: t.diagnostics });
export const replyTicket = (db: SupabaseClient, id: string, body: string) => rpc<Row>(db, "reply_ticket", { p_ticket: id, p_body: body });
export const closeTicket = (db: SupabaseClient, id: string) => rpc<Row>(db, "close_ticket", { p_ticket: id });
export const mySessions = (db: SupabaseClient) => rpc<Row[]>(db, "my_sessions");
export const revokeSessions = (db: SupabaseClient, sessionId: string | null) => rpc<number>(db, "revoke_sessions", { p_session: sessionId });

export const getProject = async (db: SupabaseClient, id: string) => (await rows(db.from("projects").select("id, title").eq("id", id)))[0] ?? null;
export const failedJobs = (db: SupabaseClient, projectId: string, since: string) =>
  rows(db.from("jobs").select("engine_id, error, completed_at, created_at").eq("project_id", projectId).eq("status", "failed").gte("created_at", since));
export const queuedJobs = (db: SupabaseClient, projectId: string) =>
  rows(db.from("jobs").select("engine_id, created_at").eq("project_id", projectId).eq("status", "queued"));
export async function reviewCount(db: SupabaseClient, table: string, projectId: string) {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId).neq("review_state", "current");
  if (error) throw mapDbError(error);
  return count ?? 0;
}
export const script = async (db: SupabaseClient, projectId: string) => (await rows(db.from("scripts").select("approved_version_id").eq("project_id", projectId)))[0] ?? null;
export const timeline = async (db: SupabaseClient, projectId: string) => (await rows(db.from("timelines").select("status").eq("project_id", projectId)))[0] ?? null;
