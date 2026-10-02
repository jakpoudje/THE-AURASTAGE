// Thin client for the Casting API (apps/api/src/modules/characters). No logic here.
import type {
  Character,
  CharacterAlias,
  CharacterRelationship,
  CreateCharacterInput,
  SaveWardrobeLookInput,
  CharacterAgeState,
  SaveCharacterAgeStateInput,
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
  applySuggestions: (projectId: string) =>
    apiPost<{ updated: { id: string; name: string; fields: string[] }[]; unchanged: number; relationships_added?: { a: string; b: string; relationship: string }[] }>(`/api/projects/${projectId}/characters/apply-suggestions`, {}),
  markDistinct: (projectId: string, a: string, b: string) => apiPost<{ ok: true }>(`/api/projects/${projectId}/characters/distinct`, { a_id: a, b_id: b }),
  unmerge: (characterId: string) => apiPost<Character>(`/api/characters/${characterId}/unmerge`, {}),
  create: (projectId: string, input: Partial<CreateCharacterInput> & { name: string }) =>
    apiPost<Character>(`/api/projects/${projectId}/characters`, input),
  setRelationship: (projectId: string, input: SetRelationshipInput) =>
    apiPost<CharacterRelationship>(`/api/projects/${projectId}/relationships`, input),
  deleteRelationship: (id: string) => apiDelete<{ deleted: boolean }>(`/api/relationships/${id}`),
  saveLook: (characterId: string, input: SaveWardrobeLookInput) => apiPost<WardrobeLook>(`/api/characters/${characterId}/looks`, input),
  deleteLook: (id: string) => apiDelete<{ deleted: boolean }>(`/api/looks/${id}`),
  listAges: (characterId: string) => apiGet<{ age_states: CharacterAgeState[] }>(`/api/characters/${characterId}/ages`),
  saveAge: (characterId: string, input: SaveCharacterAgeStateInput) => apiPost<CharacterAgeState>(`/api/characters/${characterId}/ages`, input),
  deleteAge: (id: string) => apiDelete<{ deleted: boolean }>(`/api/ages/${id}`),
};
