// Thin client for the Scriptwriter API (apps/api/src/modules/screenplay) and
// the project story fields (apps/api/src/modules/projects). No logic here.
import type { Project, ScopePlan, Script, ScriptVersion, UpdateProjectInput } from "@aurastage/contracts";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import type { ScriptWorkspace } from "../types";

export const scriptwriterApi = {
  getProject: (id: string) => apiGet<Project>(`/api/projects/${id}`),
  updateStorySetup: (project: Project, input: UpdateProjectInput) =>
    apiPatch<Project>(`/api/projects/${project.id}`, { ...input, org_id: project.org_id }),
  getWorkspace: (id: string) => apiGet<ScriptWorkspace>(`/api/projects/${id}/script`),
  saveVersion: (id: string, body: { source_text: string; base_version_id: string | null; note?: string }) =>
    apiPost<ScriptVersion>(`/api/projects/${id}/script/versions`, body),
  approve: (id: string, versionId: string) => apiPost<Script>(`/api/projects/${id}/script/approve`, { version_id: versionId }),
  getScopePlan: (id: string) => apiGet<{ plan: ScopePlan | null }>(`/api/projects/${id}/scope-plan`),
};
