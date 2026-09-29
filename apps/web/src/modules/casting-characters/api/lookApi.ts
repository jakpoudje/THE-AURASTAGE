// Character look panel API (apps/api/src/modules/characters/characters.look.ts). No logic here.
import { apiGet, apiGetBytes, apiPost } from "@/lib/apiClient";

export interface LookView {
  key: string; angle: "front" | "three_quarter" | "profile" | "back"; size: "CU" | "MCU" | "MS" | "FULL"; label: string; prompt: string; aspect_ratio: "1:1" | "9:16";
  in_default_set: boolean; versions: number;
  latest: { id: string; status: "queued" | "running" | "succeeded" | "failed"; error: string | null; provider: string; execution: string; created_at: string } | null;
  image: { reference_id: string; asset_id: string; provider: string; execution: string; created_at: string; stale: boolean } | null;
}
export interface CharacterLookView {
  character: { id: string; name: string; project_id: string };
  looks: { id: string; name: string }[]; look_id: string | null;
  identity: string; wardrobe: string | null; identity_hash: string; missing: string[]; negative: string[]; engine_version: string;
  views: LookView[];
  backends: { id: string; name: string; model: string; execution: "native" | "external"; note: string }[];
  backend_statuses: { id: string; name: string; state: "configured" | "not_configured"; note: string }[];
}

export const lookApi = {
  get: (characterId: string, lookId: string | null) => apiGet<CharacterLookView>(`/api/characters/${characterId}/look${lookId ? `?look_id=${lookId}` : ""}`),
  generate: (characterId: string, body: { look_id: string | null; views?: string[]; provider?: string }) =>
    apiPost<{ requested: { id: string; key: string }[]; provider: string }>(`/api/characters/${characterId}/look/generate`, body),
  image: (assetId: string) => apiGetBytes(`/api/assets/${assetId}/content`),
};
