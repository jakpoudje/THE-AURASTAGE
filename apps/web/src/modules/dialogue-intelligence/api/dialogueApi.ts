// Thin client for the Dialogue API (apps/api/src/modules/dialogue). No logic here.
import type { DialogueLine, UpdateDialogueLineInput } from "@aurastage/contracts";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import type { DialogueWorkspace } from "../types";

export const dialogueApi = {
  getWorkspace: (projectId: string) => apiGet<DialogueWorkspace>(`/api/projects/${projectId}/dialogue`),
  sync: (projectId: string) => apiPost<{ created: number; kept: number; changed: number; omitted: number }>(`/api/projects/${projectId}/dialogue/sync`, {}),
  updateLine: (lineId: string, input: UpdateDialogueLineInput) => apiPatch<DialogueLine>(`/api/dialogue-lines/${lineId}`, input),
  approveScene: (projectId: string, sceneId: string) =>
    apiPost<{ approved_lines: number }>(`/api/projects/${projectId}/dialogue/scenes/${sceneId}/approve`, {}),
};
