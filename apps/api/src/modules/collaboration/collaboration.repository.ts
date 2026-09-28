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
