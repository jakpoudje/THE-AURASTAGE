// Domain workflow and transaction boundaries.
// Domain: Team & Collaboration

import type { SupabaseClient } from "@supabase/supabase-js";
import { CreateInviteInputSchema, InviteTokenInputSchema, SetOrgRoleInputSchema, SetProjectMemberInputSchema } from "@aurastage/contracts";
import * as repo from "./collaboration.repository";
import { toAccessDTO, toInviteDTO, toInvitePreviewDTO, toMemberDTO, toMembershipDTOs, toOrganizationDTO, toRoleDTO } from "./collaboration.mapper";
import { CollaborationNotFoundError, parse, slugify, validateCreateOrganizationInput } from "./collaboration.validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value: string, what: string) {
  if (!UUID.test(value)) throw new CollaborationNotFoundError(`${what} not found`);
  return value;
}

export async function listMyOrganizations(db: SupabaseClient, userId: string) {
  const rows = await repo.getMyMemberships(db, userId);
  return toMembershipDTOs(rows as never);
}

/**
 * Idempotent bootstrap: returns the caller's first organization if one
 * exists, otherwise creates one. This is what the web app's Dashboard calls
 * right after first sign-in so every user lands in a real org without a
 * separate "create your studio" step blocking the vertical slice.
 */
export async function bootstrapOrganization(db: SupabaseClient, userId: string, payload: unknown) {
  const existing = await repo.getMyMemberships(db, userId);
  if (existing.length > 0) {
    return toOrganizationDTO(existing[0].organizations);
  }
  const input = validateCreateOrganizationInput(payload);
  const org = await repo.createOrganization(db, input.name, slugify(input.name));
  return toOrganizationDTO(org);
}

export async function getProjectAccess(db: SupabaseClient, projectId: string) {
  return toAccessDTO(await repo.projectAccess(db, id(projectId, "Project")));
}

/** The project's team page: who has access, with which role, and (for team administrators) open invites. */
export async function getProjectTeam(db: SupabaseClient, projectId: string) {
  const access = toAccessDTO(await repo.projectAccess(db, id(projectId, "Project")));
  const canManage = access.modules.team?.includes("administer") ?? false;
  const [project, roles, members, invites] = await Promise.all([
    repo.getProject(db, projectId),
    repo.listRoles(db),
    repo.projectTeam(db, projectId),
    canManage ? repo.listOpenInvites(db, { projectId }) : Promise.resolve([]),
  ]);
  if (!project) throw new CollaborationNotFoundError("Project not found");
  return {
    project: { id: project.id, title: project.title, org_id: project.org_id },
    access,
    can_manage: canManage,
    can_manage_studio: access.org_role === "owner" || access.org_role === "admin",
    roles: roles.map(toRoleDTO),
    members: members.map(toMemberDTO),
    invites: invites.map(toInviteDTO),
  };
}

/** Everyone in the studio (owners, admins and producers only — the database refuses others). */
export async function getOrgTeam(db: SupabaseClient, orgId: string) {
  const [members, invites, projects] = await Promise.all([
    repo.orgTeam(db, id(orgId, "Studio")),
    repo.listOpenInvites(db, { orgId }),
    repo.listProjects(db, orgId),
  ]);
  return {
    members: members.map((m) => ({ ...m, last_sign_in_at: m.last_sign_in_at ?? null })),
    invites: invites.map(toInviteDTO),
    projects,
  };
}

export async function createInvite(db: SupabaseClient, orgId: string, payload: unknown) {
  const input = parse(CreateInviteInputSchema, payload);
  const r = await repo.createInvite(db, id(orgId, "Studio"), {
    email: input.email,
    org_role: input.org_role,
    project_id: input.project_id ?? null,
    project_role: input.org_role === "member" ? input.project_role ?? null : input.project_role ?? null,
    grants: input.grants,
  });
  // The plain token is shown once so the inviter can copy the link; only its hash is stored.
  return { invite: toInviteDTO(r.invite), token: r.token };
}

export async function revokeInvite(db: SupabaseClient, inviteId: string) {
  await repo.revokeInvite(db, id(inviteId, "Invite"));
  return { ok: true };
}

export async function previewInvite(db: SupabaseClient, payload: unknown) {
  const { token } = parse(InviteTokenInputSchema, payload);
  return toInvitePreviewDTO(await repo.invitePreview(db, token));
}

export async function acceptInvite(db: SupabaseClient, payload: unknown) {
  const { token } = parse(InviteTokenInputSchema, payload);
  return repo.acceptInvite(db, token);
}

export async function setProjectMember(db: SupabaseClient, projectId: string, payload: unknown) {
  const input = parse(SetProjectMemberInputSchema, payload);
  await repo.setProjectMember(db, id(projectId, "Project"), input.user_id, input.role, input.grants);
  return getProjectTeam(db, projectId);
}

export async function removeProjectMember(db: SupabaseClient, projectId: string, userId: string) {
  await repo.removeProjectMember(db, id(projectId, "Project"), id(userId, "Person"));
  return { ok: true };
}

export async function setOrgRole(db: SupabaseClient, orgId: string, userId: string, payload: unknown) {
  const { role } = parse(SetOrgRoleInputSchema, payload);
  await repo.setOrgRole(db, id(orgId, "Studio"), id(userId, "Person"), role);
  return getOrgTeam(db, orgId);
}

export async function removeOrgMember(db: SupabaseClient, orgId: string, userId: string) {
  await repo.removeOrgMember(db, id(orgId, "Studio"), id(userId, "Person"));
  return { ok: true };
}
