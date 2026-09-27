// Thin client for the Casting API (apps/api/src/modules/characters). No logic here.
import type {
  Character,
  CharacterAlias,
  CharacterRelationship,
  CreateCharacterInput,
  SaveWardrobeLookInput,
  SetRelationshipInput,
  UpdateCharacterInput,
  WardrobeLook,
} from "@aurastage/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import type { CastingWorkspace } from "../types";

export const castingApi = {
  getWorkspace: (projectId: string) => apiGet<CastingWorkspace>(`/api/projects/${projectId}/characters`),
  sync: (projectId: string, confirm: string[] = []) =>
    apiPost<{ summary: { created: number; matched: number; appearances: number }; pending: unknown[] }>(
      `/api/projects/${projectId}/characters/sync`,
      { confirm }
    ),
  update: (characterId: string, input: UpdateCharacterInput) => apiPatch<Character>(`/api/characters/${characterId}`, input),
  addAlias: (characterId: string, alias: string) => apiPost<CharacterAlias>(`/api/characters/${characterId}/aliases`, { alias }),
  merge: (projectId: string, sourceId: string, targetId: string) =>
    apiPost<Character>(`/api/projects/${projectId}/characters/merge`, { source_id: sourceId, target_id: targetId }),
  unmerge: (characterId: string) => apiPost<Character>(`/api/characters/${characterId}/unmerge`, {}),
  create: (projectId: string, input: Partial<CreateCharacterInput> & { name: string }) =>
    apiPost<Character>(`/api/projects/${projectId}/characters`, input),
  setRelationship: (projectId: string, input: SetRelationshipInput) =>
    apiPost<CharacterRelationship>(`/api/projects/${projectId}/relationships`, input),
  deleteRelationship: (id: string) => apiDelete<{ deleted: boolean }>(`/api/relationships/${id}`),
  saveLook: (characterId: string, input: SaveWardrobeLookInput) => apiPost<WardrobeLook>(`/api/characters/${characterId}/looks`, input),
  deleteLook: (id: string) => apiDelete<{ deleted: boolean }>(`/api/looks/${id}`),
};
