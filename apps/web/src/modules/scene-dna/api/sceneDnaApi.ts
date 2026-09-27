// Thin client for the Scene DNA API (apps/api/src/modules/scene-dna). No logic here.
import type { SceneDnaRecord, UpdateSceneDnaInput } from "@aurastage/contracts";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import type { SceneDnaWorkspace } from "../types";

export const sceneDnaApi = {
  getWorkspace: (projectId: string) => apiGet<SceneDnaWorkspace>(`/api/projects/${projectId}/scene-dna`),
  save: (projectId: string, sceneId: string, input: UpdateSceneDnaInput) =>
    apiPatch<SceneDnaRecord>(`/api/projects/${projectId}/scene-dna/${sceneId}`, input),
  approve: (projectId: string, sceneId: string) =>
    apiPost<{ version_id: string; version_number: number; dependencies: number }>(`/api/projects/${projectId}/scene-dna/${sceneId}/approve`, {}),
};
