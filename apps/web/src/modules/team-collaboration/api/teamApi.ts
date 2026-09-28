// Team & Collaboration API calls (apps/api/src/modules/collaboration).
import type { CreateInviteInput, Invite, InvitePreview, SetProjectMemberInput } from "@aurastage/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import type { ProjectTeam, StudioTeam } from "../types";

export const teamApi = {
  projectTeam: (projectId: string) => apiGet<ProjectTeam>(`/api/projects/${projectId}/team`),
  setMember: (projectId: string, input: SetProjectMemberInput) => apiPost<ProjectTeam>(`/api/projects/${projectId}/team/members`, input),
  removeMember: (projectId: string, userId: string) => apiDelete<{ ok: true }>(`/api/projects/${projectId}/team/members/${userId}`),
  studioTeam: (orgId: string) => apiGet<StudioTeam>(`/api/organizations/${orgId}/team`),
  setStudioRole: (orgId: string, userId: string, role: string) => apiPatch<StudioTeam>(`/api/organizations/${orgId}/members/${userId}`, { role }),
  removeFromStudio: (orgId: string, userId: string) => apiDelete<{ ok: true }>(`/api/organizations/${orgId}/members/${userId}`),
  invite: (orgId: string, input: Partial<CreateInviteInput> & { email: string }) => apiPost<{ invite: Invite; token: string }>(`/api/organizations/${orgId}/invites`, input),
  revokeInvite: (inviteId: string) => apiDelete<{ ok: true }>(`/api/invites/${inviteId}`),
  preview: (token: string) => apiPost<InvitePreview>("/api/invites/preview", { token }),
  accept: (token: string) => apiPost<{ org_id: string; project_id: string | null }>("/api/invites/accept", { token }),
};

/** The link an invitee opens. The token sits after "#", so it never reaches any server log. */
export const inviteLink = (token: string) => `${window.location.origin}/invite#${token}`;
