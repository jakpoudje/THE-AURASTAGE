// Thin client for the Visual Generation API (apps/api/src/modules/generation). No logic here.
import type { RequestTakeInput, Take } from "@aurastage/contracts";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { VisualWorkspace } from "../types";

export const visualApi = {
  getWorkspace: (projectId: string) => apiGet<VisualWorkspace>(`/api/projects/${projectId}/visual`),
  compile: (projectId: string, shotId: string, aspect_ratio: string) =>
    apiPost<{ package_id: string; checks: { ok: boolean }[]; prompt: string }>(`/api/projects/${projectId}/visual/shots/${shotId}/compile`, { aspect_ratio }),
  // One click for the whole film (owner, 2026-10-02).
  compileAll: (projectId: string) => apiPost<{ compiled: number; already: number; waiting_scenes: number[] }>(`/api/projects/${projectId}/visual/compile-all`, {}),
  sketchAll: (projectId: string) => apiPost<{ requested: number; already: number; needs_prompt: number }>(`/api/projects/${projectId}/visual/sketch-all`, {}),
  approveAll: (projectId: string) => apiPost<{ approved: number; waiting: number; total: number }>(`/api/projects/${projectId}/visual/approve-all`, {}),
  requestTakes: (packageId: string, input: Partial<RequestTakeInput>) => apiPost<{ takes: Take[] }>(`/api/visual/packages/${packageId}/takes`, input),
  approve: (takeId: string) => apiPost<Take>(`/api/takes/${takeId}/approve`, {}),
  reject: (takeId: string) => apiPost<Take>(`/api/takes/${takeId}/reject`, {}),
  reopen: (takeId: string) => apiPost<Take>(`/api/takes/${takeId}/reopen`, {}),
  cancel: (takeId: string) => apiPost<Take>(`/api/takes/${takeId}/cancel`, {}),
};
