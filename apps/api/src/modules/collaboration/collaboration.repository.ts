// Canonical persistence access for this domain.
// Domain: Team & Collaboration
// Canonical objects: Organization / OrgMember / ProjectMember / Invite (migration 0019).
// Reads go through RLS; every write is a permission-checked database function.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CollaborationConflictError, CollaborationGoneError, CollaborationNotFoundError, CollaborationValidationError } from "./collaboration.validator";
import { CollaborationForbiddenError } from "./collaboration.permissions";

type Row = Record<string, any>;

function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-COL-\d+:\s*/, "");
  if (msg.startsWith("AURA-COL-403") || msg.startsWith("AURA-COL-401") || error.code === "42501") return new CollaborationForbiddenError(msg.startsWith("AURA-COL") ? text : undefined);
  if (msg.startsWith("AURA-COL-404")) return new CollaborationNotFoundError(text);
  if (msg.startsWith("AURA-COL-409")) return new CollaborationConflictError(text);
  if (msg.startsWith("AURA-COL-410")) return new CollaborationGoneError(text);
  if (msg.startsWith("AURA-COL-400") || error.code === "23514") return new CollaborationValidationError([], msg.startsWith("AURA-COL") ? text : "That value isn't allowed");
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Row): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}
async function rows<T = Row>(q: PromiseLike<{ data: unknown[] | null; error: any }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as T[];
}

export async function getMyMemberships(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("org_members")
    .select("org_id, role, organizations(id, name, slug, created_at)")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

export async function createOrganization(db: SupabaseClient, name: string, slug: string) {
  const { data, error } = await db.rpc("create_organization", { org_name: name, org_slug: slug });
  if (error) throw error;
  return data;
}

export const projectAccess = (db: SupabaseClient, projectId: string) => rpc<Row>(db, "project_access", { p_project: projectId });
export const projectTeam = (db: SupabaseClient, projectId: string) => rpc<Row[]>(db, "project_team", { p_project: projectId });
export const orgTeam = (db: SupabaseClient, orgId: string) => rpc<Row[]>(db, "org_team", { p_org: orgId });
export const listRoles = (db: SupabaseClient) => rows(db.from("project_roles").select("*").order("sort"));
export const getProject = async (db: SupabaseClient, projectId: string) =>
  (await rows(db.from("projects").select("id, org_id, title").eq("id", projectId)))[0] ?? null;
export const listProjects = (db: SupabaseClient, orgId: string) => rows(db.from("projects").select("id, title").eq("org_id", orgId).order("created_at", { ascending: false }));
/** Open invites the caller may manage (RLS: studio owners/admins, or the project's team administrators). */
export const listOpenInvites = (db: SupabaseClient, filter: { orgId?: string; projectId?: string }) => {
  let q = db.from("invites").select("id, org_id, project_id, email, org_role, project_role, grants, created_at, expires_at, accepted_at, revoked_at")
    .is("accepted_at", null).is("revoked_at", null);
  if (filter.orgId) q = q.eq("org_id", filter.orgId);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  return rows(q.order("created_at", { ascending: false }));
};

export const setProjectMember = (db: SupabaseClient, projectId: string, userId: string, role: string, grants: string[]) =>
  rpc<Row>(db, "set_project_member", { p_project: projectId, p_user: userId, p_role: role, p_grants: grants });
export const removeProjectMember = (db: SupabaseClient, projectId: string, userId: string) =>
  rpc<void>(db, "remove_project_member", { p_project: projectId, p_user: userId });
export const setOrgRole = (db: SupabaseClient, orgId: string, userId: string, role: string) =>
  rpc<void>(db, "set_org_member_role", { p_org: orgId, p_user: userId, p_role: role });
export const removeOrgMember = (db: SupabaseClient, orgId: string, userId: string) =>
  rpc<void>(db, "remove_org_member", { p_org: orgId, p_user: userId });
export const createInvite = (db: SupabaseClient, orgId: string, i: { email: string; org_role: string; project_id: string | null; project_role: string | null; grants: string[] }) =>
  rpc<{ invite: Row; token: string }>(db, "create_invite", {
    p_org: orgId, p_email: i.email, p_org_role: i.org_role, p_project: i.project_id, p_project_role: i.project_role, p_grants: i.grants,
  });
export const revokeInvite = (db: SupabaseClient, inviteId: string) => rpc<void>(db, "revoke_invite", { p_invite: inviteId });
export const invitePreview = (db: SupabaseClient, token: string) => rpc<Row>(db, "invite_preview", { p_token: token });
export const acceptInvite = (db: SupabaseClient, token: string) => rpc<{ org_id: string; project_id: string | null }>(db, "accept_invite", { p_token: token });

// ---- 11b: comments, tasks, notifications, activity (migration 0021) ----
export const listComments = (db: SupabaseClient, projectId: string, f: { module?: string | null; objectType?: string | null; objectId?: string | null }) =>
  rpc<Row[]>(db, "list_comments", { p_project: projectId, p_module: f.module ?? null, p_object_type: f.objectType ?? null, p_object_id: f.objectId ?? null });
export const addComment = (db: SupabaseClient, projectId: string, c: Row) =>
  rpc<Row>(db, "add_comment", {
    p_project: projectId, p_module: c.module, p_object_type: c.object_type, p_object_id: c.object_id, p_object_version: c.object_version ?? null,
    p_anchor: c.anchor ?? {}, p_body: c.body, p_parent: c.parent_id ?? null, p_mentions: c.mentions ?? [],
  });
export const resolveComment = (db: SupabaseClient, id: string, resolved: boolean) => rpc<Row>(db, "resolve_comment", { p_comment: id, p_resolved: resolved });
export const editComment = (db: SupabaseClient, id: string, body: string | null, del: boolean) =>
  rpc<Row>(db, "edit_comment", { p_comment: id, p_body: body, p_delete: del });
export const getComment = async (db: SupabaseClient, id: string) =>
  (await rows(db.from("comments").select("id, project_id").eq("id", id)))[0] ?? null;
export const listTasks = (db: SupabaseClient, projectId: string | null, mine: boolean) => rpc<Row[]>(db, "list_tasks", { p_project: projectId, p_mine: mine });
export const createTask = (db: SupabaseClient, projectId: string, t: Row) =>
  rpc<Row>(db, "create_task", {
    p_project: projectId, p_module: t.module, p_object_type: t.object_type ?? null, p_object_id: t.object_id ?? null, p_kind: t.kind,
    p_title: t.title, p_assignee: t.assignee ?? null, p_due: t.due_date ?? null,
  });
export const setTaskStatus = (db: SupabaseClient, id: string, status: string) => rpc<Row>(db, "set_task_status", { p_task: id, p_status: status });
export const listNotifications = (db: SupabaseClient, limit: number) =>
  rows(db.from("notifications").select("id, project_id, kind, title, body, link, created_at, read_at").order("created_at", { ascending: false }).limit(limit));
export const countUnread = async (db: SupabaseClient) => {
  const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw mapDbError(error);
  return count ?? 0;
};
export const markRead = (db: SupabaseClient, ids: string[] | null) => rpc<number>(db, "mark_notifications_read", { p_ids: ids });
export const projectActivity = (db: SupabaseClient, projectId: string, before: string | null, limit: number) =>
  rpc<Row[]>(db, "project_activity", { p_project: projectId, p_before: before, p_limit: limit });

// ---- Production hand-offs (migration 0057) ----
export const listStageOwners = (db: SupabaseClient, projectId: string) =>
  rows(db.from("project_stage_owners").select("stage, user_ids, updated_at").eq("project_id", projectId));
export const setStageOwners = (db: SupabaseClient, projectId: string, stage: string, userIds: string[]) =>
  rpc<string[]>(db, "set_stage_owners", { p_project: projectId, p_stage: stage, p_users: userIds });
