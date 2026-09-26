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
