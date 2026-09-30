// Locations & Props API (apps/api/src/modules/world). No logic here.
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";

export type WorldKind = "location" | "prop";
export interface WorldScene { scene_id: string; scene_number: number; line: number | null; evidence: string; source: "script" | "manual" }
export interface WorldItem {
  id: string; kind: WorldKind; name: string; key: string; description: string; status: "detected" | "confirmed"; source: "script" | "manual";
  revision: number; archived: boolean; missing_from_script: boolean; scenes: WorldScene[]; thumbnail_asset_id: string | null;
  int_ext?: string[]; times_of_day?: string[]; areas?: string[];
  category?: "prop" | "vehicle"; descriptors?: string[]; confidence?: "high" | "medium" | "manual"; reason?: string;
}
export interface WorldWorkspace {
  locations: WorldItem[]; props: WorldItem[];
  sync: { state: "no_script" | "never" | "current" | "stale"; synced_at: string | null; summary: Record<string, number> | null };
}
export interface WorldView {
  key: string; view: string; time: string | null; label: string; prompt: string; aspect_ratio: "16:9" | "1:1"; in_default_set: boolean; versions: number;
  latest: { id: string; status: "queued" | "running" | "succeeded" | "failed"; error: string | null; provider: string; execution: string } | null;
  image: { reference_id: string; asset_id: string; provider: string; execution: string; created_at: string; stale: boolean } | null;
}
export interface WorldLook {
  item: { id: string; kind: WorldKind; name: string; project_id: string };
  identity: string; identity_hash: string; missing: string[]; views: WorldView[];
  backends: { id: string; name: string; model?: string; execution: "native" | "external" }[];
  backend_statuses: { id: string; name: string; state: "configured" | "not_configured" }[];
}
export interface WorldPatch { revision?: number; name?: string; description?: string; category?: "prop" | "vehicle"; status?: "detected" | "confirmed"; archived?: boolean; int_ext?: ("INT" | "EXT")[] }

export const worldApi = {
  workspace: (projectId: string) => apiGet<WorldWorkspace>(`/api/projects/${projectId}/world`),
  sync: (projectId: string) => apiPost<{ new_locations: number; new_props: number; flagged: number; locations: number; props: number; script_version_number: number }>(`/api/projects/${projectId}/world/sync`, {}),
  create: (projectId: string, kind: WorldKind, body: WorldPatch) => apiPost<Record<string, unknown>>(`/api/projects/${projectId}/world/${kind}`, body),
  update: (kind: WorldKind, id: string, body: WorldPatch) => apiPatch<Record<string, unknown>>(`/api/world/${kind}/${id}`, body),
  look: (kind: WorldKind, id: string) => apiGet<WorldLook>(`/api/world/${kind}/${id}/look`),
  generate: (kind: WorldKind, id: string, body: { views?: string[]; provider?: string }) =>
    apiPost<{ requested: { id: string; key: string }[]; provider: string }>(`/api/world/${kind}/${id}/look/generate`, body),
};
