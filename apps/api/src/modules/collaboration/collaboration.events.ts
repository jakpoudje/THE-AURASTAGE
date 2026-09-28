// apps/api/src/modules/collaboration/collaboration.events.ts
// Domain: Team & Collaboration. Every event below is written to audit_events by the
// database function that performs the change (migration 0019), in the same transaction.
export const COLLABORATION_EVENTS = {
  OrganizationCreated: "OrganizationCreated",
  InviteCreated: "InviteCreated",
  InviteRevoked: "InviteRevoked",
  InviteAccepted: "InviteAccepted",
  ProjectMemberAdded: "ProjectMemberAdded",
  ProjectMemberChanged: "ProjectMemberChanged",
  ProjectMemberRemoved: "ProjectMemberRemoved",
  OrgRoleChanged: "OrgRoleChanged",
  OrgMemberRemoved: "OrgMemberRemoved",
  OrgMemberLeft: "OrgMemberLeft",
} as const;
