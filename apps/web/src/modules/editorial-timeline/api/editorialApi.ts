// Thin client for the Editorial API. No logic here.
import type { EditOperation, TimelineAutomation } from "@aurastage/contracts";
import { apiGet, apiGetBytes, apiPost, apiPut } from "@/lib/apiClient";
import type { EditorialWorkspace } from "../types";

const base = (p: string) => `/api/projects/${p}/editorial`;
export const editorialApi = {
  getWorkspace: (projectId: string) => apiGet<EditorialWorkspace>(base(projectId)),
  assemble: (projectId: string, base_revision: string | null, break_lock = false, scene_ids?: string[]) =>
    apiPost<{ summary: string; rationale: string[] }>(`${base(projectId)}/assemble`, { base_revision, ...(break_lock ? { break_lock } : {}), ...(scene_ids ? { scene_ids } : {}) }),
  edit: (projectId: string, base_revision: string, operation: EditOperation, break_lock = false) =>
    apiPost<{ summary: string }>(`${base(projectId)}/edit`, { base_revision, operation, ...(break_lock ? { break_lock } : {}) }),
  saveVersion: (projectId: string, label: string) => apiPost<{ version_number: number; label: string }>(`${base(projectId)}/versions`, { label }),
  restore: (projectId: string, versionId: string, base_revision: string, break_lock = false) =>
    apiPost<{ summary: string }>(`${base(projectId)}/versions/${versionId}/restore`, { base_revision, ...(break_lock ? { break_lock } : {}) }),
  /** Undo the newest edit on this revision (migration 0054). */
  undo: (projectId: string, base_revision: string, break_lock = false) =>
    apiPost<{ summary: string }>(`${base(projectId)}/undo`, { base_revision, ...(break_lock ? { break_lock } : {}) }),
  lock: (projectId: string, base_revision: string) => apiPost<{ lock_number: number }>(`${base(projectId)}/lock`, { base_revision }),
  saveAutomation: (projectId: string, automation: TimelineAutomation, base_revision: string) =>
    apiPut<{ automation: TimelineAutomation; automation_revision: string; points: number }>(`${base(projectId)}/automation`, { automation, base_revision }),
  edl: (projectId: string) => apiGetBytes(`${base(projectId)}/edl`),
};
