// Thin client for the Storyboard & Shots API (apps/api/src/modules/shots). No logic here.
import type { Shot, ShotEditable, UpdateShotInput } from "@aurastage/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import type { StoryboardWorkspace } from "../types";

const scene = (projectId: string, sceneId: string) => `/api/projects/${projectId}/storyboard/scenes/${sceneId}`;

export const storyboardApi = {
  getWorkspace: (projectId: string) => apiGet<StoryboardWorkspace>(`/api/projects/${projectId}/storyboard`),
  generate: (projectId: string, sceneId: string, replace = false) =>
    apiPost<{ plan_id: string; shots: number; scene_dna_version_number: number }>(`${scene(projectId, sceneId)}/generate`, { replace }),
  addShot: (projectId: string, sceneId: string, shot: ShotEditable, afterOrdinal: number | null) =>
    apiPost<Shot>(`${scene(projectId, sceneId)}/shots`, { shot, after_ordinal: afterOrdinal }),
  approve: (projectId: string, sceneId: string) =>
    apiPost<{ version_id: string; version_number: number; coverage: number }>(`${scene(projectId, sceneId)}/approve`, {}),
  updateShot: (shotId: string, input: UpdateShotInput) => apiPatch<Shot>(`/api/shots/${shotId}`, input),
  moveShot: (shotId: string, direction: -1 | 1) => apiPost<Shot>(`/api/shots/${shotId}/move`, { direction }),
  deleteShot: (shotId: string) => apiDelete<{ deleted_ordinal: number }>(`/api/shots/${shotId}`),
};
