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

// ---- Phase 11b: comments, mentions, notifications, tasks, activity ----

export const CommentAnchorSchema = z
  .object({
    frame: z.number().int().nonnegative().optional(),
    timecode: z.string().max(20).optional(),
    label: z.string().max(120).optional(),
  })
  .strict();
export type CommentAnchor = z.infer<typeof CommentAnchorSchema>;

export const CreateCommentInputSchema = z
  .object({
    module: PermissionModuleSchema,
    object_type: z.string().regex(/^[A-Za-z]{2,40}$/),
    object_id: z.string().uuid(),
    object_version: z.string().max(80).nullable().optional(),
    anchor: CommentAnchorSchema.default({}),
    body: z.string().trim().min(1, "Write something first").max(4000),
    parent_id: z.string().uuid().nullable().optional(),
    mentions: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict();
export type CreateCommentInput = z.infer<typeof CreateCommentInputSchema>;

export const CommentSchema = z.object({
  id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  module: z.string(),
  object_type: z.string(),
  object_id: z.string().uuid(),
  object_version: z.string().nullable(),
  anchor: z.record(z.unknown()),
  body: z.string(),
  mentions: z.array(z.string()),
  mention_emails: z.array(z.string()),
  created_by: z.string().uuid().nullable(),
  author_email: z.string().nullable(),
  created_at: z.string(),
  edited_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  resolved_by_email: z.string().nullable(),
  deleted_at: z.string().nullable(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const TaskStatusSchema = z.enum(["open", "in_progress", "done", "cancelled"]);
export const CreateTaskInputSchema = z
  .object({
    module: PermissionModuleSchema,
    object_type: z.string().regex(/^[A-Za-z]{2,40}$/).nullable().optional(),
    object_id: z.string().uuid().nullable().optional(),
    kind: z.enum(["task", "review"]).default("task"),
    title: z.string().trim().min(1, "Give the task a title").max(200),
    assignee: z.string().uuid().nullable().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-01").nullable().optional(),
  })
  .strict();
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  project_title: z.string(),
  module: z.string(),
  object_type: z.string().nullable(),
  object_id: z.string().uuid().nullable(),
  kind: z.enum(["task", "review"]),
  title: z.string(),
  assignee: z.string().uuid().nullable(),
  assignee_email: z.string().nullable(),
  status: TaskStatusSchema,
  due_date: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  creator_email: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  kind: z.enum(["mention", "reply", "task_assigned", "review_requested", "task_done"]),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const ActivityItemSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  summary: z.string(),
  object_type: z.string(),
  object_id: z.string().uuid().nullable(),
  actor_email: z.string().nullable(),
  created_at: z.string(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
