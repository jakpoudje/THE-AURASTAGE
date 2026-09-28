// apps/api/src/modules/collaboration/collaboration.mapper.ts
// Domain: Team & Collaboration

import { InvitePreviewSchema, InviteSchema, OrganizationSchema, ProjectAccessSchema, ProjectRoleSchema, TeamMemberSchema } from "@aurastage/contracts";

export function toOrganizationDTO(row: unknown) {
  return OrganizationSchema.parse(row);
}

export function toMembershipDTOs(rows: Array<{ org_id: string; role: string; organizations: unknown }>) {
  return rows.map((r) => ({
    org_id: r.org_id,
    role: r.role,
    organization: OrganizationSchema.parse(r.organizations),
  }));
}

export const toAccessDTO = (row: unknown) => ProjectAccessSchema.parse(row);
export const toRoleDTO = (row: unknown) => ProjectRoleSchema.parse(row);
export const toMemberDTO = (row: Record<string, unknown>) => TeamMemberSchema.parse({ ...row, grants: row.grants ?? [] });
export const toInviteDTO = (row: unknown) => InviteSchema.parse(row);
export const toInvitePreviewDTO = (row: unknown) => InvitePreviewSchema.parse(row);
