// Character look panel API (apps/api/src/modules/characters/characters.look.ts). No logic here.
import { apiGet, apiGetBytes, apiPost, apiUpload } from "@/lib/apiClient";

export interface LookView {
  key: string; angle: "front" | "three_quarter" | "profile" | "back"; size: "CU" | "MCU" | "MS" | "FULL"; label: string; prompt: string; aspect_ratio: "1:1" | "9:16";
  in_default_set: boolean; versions: number;
  latest: { id: string; status: "queued" | "running" | "succeeded" | "failed" | "withdrawn"; error: string | null; provider: string; execution: string; created_at: string } | null;
  image: { reference_id: string; asset_id: string; provider: string; execution: string; created_at: string; stale: boolean; performer?: string | null } | null;
}
export interface CharacterLookView {
  character: { id: string; name: string; project_id: string };
  looks: { id: string; name: string }[]; look_id: string | null;
  age_states: { id: string; label: string; age: string }[]; age_state_id: string | null;
  /** What AuraSketch read from the profile, wardrobe and age (and what it couldn't find). */
  sketch_reads?: { evidence: { fact: string; from: string }[]; unspecified: string[] };
  identity: string; wardrobe: string | null; identity_hash: string; missing: string[]; negative: string[]; engine_version: string;
  views: LookView[];
  backends: { id: string; name: string; model: string; execution: "native" | "external"; note: string }[];
  backend_statuses: { id: string; name: string; state: "configured" | "not_configured"; note: string }[];
}

/** A performer's consent to their photos being used as this character's reference (migration 0048). */
export interface PerformerConsent {
  id: string; performer_name: string; statement: string; recorded_at: string; revoked_at: string | null; active: boolean;
  photos: { id: string; asset_id: string | null; view: string; in_use: boolean; status: string; created_at: string }[];
}

export const lookApi = {
  get: (characterId: string, lookId: string | null, ageStateId: string | null = null) => {
    const q = new URLSearchParams();
    if (lookId) q.set("look_id", lookId);
    if (ageStateId) q.set("age_state_id", ageStateId);
    return apiGet<CharacterLookView>(`/api/characters/${characterId}/look${q.toString() ? `?${q}` : ""}`);
  },
  generate: (characterId: string, body: { look_id: string | null; age_state_id?: string | null; views?: string[]; provider?: string }) =>
    apiPost<{ requested: { id: string; key: string }[]; provider: string }>(`/api/characters/${characterId}/look/generate`, body),
  /** Standard views for the whole cast in one click; views already made from the current profile are kept unless redo. */
  generateAll: (projectId: string, body: { provider?: string; redo?: boolean }) =>
    apiPost<{ characters: { id: string; name: string; requested: number; note?: string }[]; requested: number; provider: string | null; paused?: string | null }>(`/api/projects/${projectId}/characters/looks/generate`, body),
  consents: (characterId: string) => apiGet<{ consents: PerformerConsent[] }>(`/api/characters/${characterId}/consents`),
  recordConsent: (characterId: string, body: { performer_name: string; statement: string; confirm: true }) =>
    apiPost<{ id: string }>(`/api/characters/${characterId}/consents`, body),
  withdrawConsent: (consentId: string) => apiPost<{ id: string }>(`/api/consents/${consentId}/withdraw`, {}),
  /** The photo goes to the Assets Library (Characters) first, then is linked as this view under the consent. */
  addActorPhoto: async (projectId: string, characterId: string, file: File, body: { consent_id: string; view: string; look_id: string | null; age_state_id: string | null }) => {
    const q = new URLSearchParams({ name: file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "Actor photo", category: "characters" });
    const up = await apiUpload<{ asset: { id: string } }>(`/api/projects/${projectId}/library?${q}`, file, file.type || "image/jpeg");
    return apiPost<{ id: string }>(`/api/characters/${characterId}/actor-photos`, { ...body, asset_id: up.asset.id });
  },
  image: (assetId: string) => apiGetBytes(`/api/assets/${assetId}/content`),
};
