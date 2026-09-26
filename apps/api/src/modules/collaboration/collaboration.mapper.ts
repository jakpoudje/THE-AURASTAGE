// apps/api/src/modules/collaboration/collaboration.mapper.ts
// Domain: Team & Collaboration

import { OrganizationSchema } from "@aurastage/contracts";

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
