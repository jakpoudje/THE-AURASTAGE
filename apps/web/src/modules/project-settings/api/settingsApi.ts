// Project Settings API calls (apps/api/src/modules/settings).
import type { ProjectSettings } from "@aurastage/contracts";
import { apiGet, apiPost, apiPut } from "@/lib/apiClient";

export type SettingsView = {
  settings: ProjectSettings;
  revision: string | null;
  version_number: number;
  updated_at: string | null;
  story: { title: string; type: string; genre: string | null; subgenre: string | null; setting: string | null; time_period: string | null; logline: string | null; tone: string | null; target_runtime_minutes: number | null };
  facts: { id: string; label: string; value: string; reason: string }[];
  loudness_standards: { id: string; label: string; integrated_lufs: number; tolerance_lu: number; max_true_peak_dbtp: number }[];
  providers: { id: string; name: string; capabilities: string[]; state: "configured" | "not_configured" }[];
  delivery_profiles: { id: string; name: string }[];
  paid_takes_this_month: number;
  versions: { version_number: number; changed: string[]; created_at: string }[];
};
export type Impact = { changed: string[]; impact: { path: string; label: string; effect: string }[] };

export const settingsApi = {
  get: (projectId: string) => apiGet<SettingsView>(`/api/projects/${projectId}/settings`),
  impact: (projectId: string, settings: ProjectSettings) => apiPost<Impact>(`/api/projects/${projectId}/settings/impact`, { settings }),
  save: (projectId: string, base_revision: string | null, settings: ProjectSettings) => apiPut<SettingsView>(`/api/projects/${projectId}/settings`, { base_revision, settings }),
};
