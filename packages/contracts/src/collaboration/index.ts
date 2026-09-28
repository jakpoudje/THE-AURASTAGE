import { z } from "zod";

// Canonical owner: Collaboration (see docs/architecture/DATA_AUTHORITY.md)

export const OrgRoleSchema = z.enum(["owner", "admin", "producer", "member"]);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  created_at: z.string(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const OrgMemberSchema = z.object({
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: OrgRoleSchema,
  created_at: z.string(),
});
export type OrgMember = z.infer<typeof OrgMemberSchema>;

export const CreateOrganizationInputSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInputSchema>;

// ---- Phase 11: Team & Collaboration permissions (SRS §13.2) ----
// The role -> permission matrix lives only in the database (public.project_roles); the
// database checks every write. These schemas describe what crosses the API.

export const PERMISSION_MODULES = [
  "script", "casting", "dialogue", "scene_dna", "shots", "generation", "audio", "editorial", "delivery", "assets", "settings", "team",
] as const;
export const PermissionModuleSchema = z.enum(PERMISSION_MODULES);
export type PermissionModule = z.infer<typeof PermissionModuleSchema>;

export const PERMISSION_ACTIONS = ["view", "comment", "create", "edit", "generate", "approve", "lock", "administer"] as const;
export const PermissionActionSchema = z.enum(PERMISSION_ACTIONS);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

/** "module:action", e.g. "script:approve" — an extra permission on top of a member's role. */
export const PermissionGrantSchema = z
  .string()
  .regex(new RegExp(`^(${PERMISSION_MODULES.join("|")}):(${PERMISSION_ACTIONS.join("|")})$`), "Unknown permission");
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

export const ProjectRoleIdSchema = z.string().regex(/^[a-z_]{2,40}$/);

export const ProjectRoleSchema = z.object({
  id: ProjectRoleIdSchema,
  label: z.string(),
  department: z.string(),
  description: z.string(),
  permissions: z.record(z.array(z.string())),
  sort: z.number(),
});
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

/** What the signed-in person may do in a project (UI hint; the database is the authority). */
export const ProjectAccessSchema = z.object({
  project_id: z.string().uuid(),
  org_id: z.string().uuid(),
  org_role: OrgRoleSchema.nullable(),
  project_role: z.string().nullable(),
  project_role_label: z.string().nullable(),
  grants: z.array(z.string()),
  source: z.enum(["organization", "project"]),
  modules: z.record(z.array(PermissionActionSchema)),
});
export type ProjectAccess = z.infer<typeof ProjectAccessSchema>;

export const TeamMemberSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string(),
  org_role: OrgRoleSchema,
  project_role: z.string().nullable(),
  grants: z.array(z.string()),
  source: z.enum(["organization", "project"]),
  joined_at: z.string(),
  last_sign_in_at: z.string().nullable(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const InviteSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  email: z.string(),
  org_role: z.enum(["admin", "producer", "member"]),
  project_role: z.string().nullable(),
  grants: z.array(z.string()),
  created_at: z.string(),
  expires_at: z.string(),
  accepted_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const CreateInviteInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    org_role: z.enum(["admin", "producer", "member"]).default("member"),
    project_id: z.string().uuid().nullable().optional(),
    project_role: ProjectRoleIdSchema.nullable().optional(),
    grants: z.array(PermissionGrantSchema).max(40).default([]),
  })
  .strict()
  .refine((v) => v.org_role !== "member" || (v.project_id && v.project_role), {
    message: "Choose the project and role for this person",
    path: ["project_role"],
  });
export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;

export const InviteTokenInputSchema = z.object({ token: z.string().regex(/^[0-9a-f]{48}$/, "That invite link isn't valid") }).strict();

export const InvitePreviewSchema = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  email: z.string(),
  org_role: z.string(),
  project_role: z.string().nullable(),
  project_role_label: z.string().nullable(),
  organization: z.string().nullable(),
  project: z.string().nullable(),
  project_id: z.string().uuid().nullable(),
  invited_by: z.string().nullable(),
  expires_at: z.string(),
  email_matches: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreviewSchema>;

export const SetProjectMemberInputSchema = z
  .object({ user_id: z.string().uuid(), role: ProjectRoleIdSchema, grants: z.array(PermissionGrantSchema).max(40).default([]) })
  .strict();
export type SetProjectMemberInput = z.infer<typeof SetProjectMemberInputSchema>;

export const SetOrgRoleInputSchema = z.object({ role: OrgRoleSchema }).strict();
