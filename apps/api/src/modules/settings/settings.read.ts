// Read-only access to Project Settings for other domains (Audio, Generation, Delivery).
// Project Settings is the only writer (save_project_settings); everyone else reads through here so the
// defaults and parsing live in one place.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROJECT_SETTINGS, ProjectSettingsSchema, type ProjectSettings } from "@aurastage/contracts";

export type CurrentSettings = { settings: ProjectSettings; revision: string | null; version_number: number; updated_at: string | null; updated_by: string | null };

export async function readProjectSettings(db: SupabaseClient, projectId: string): Promise<CurrentSettings> {
  const { data, error } = await db.from("project_settings").select("settings, revision, version_number, updated_at, updated_by").eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) return { settings: DEFAULT_PROJECT_SETTINGS, revision: null, version_number: 0, updated_at: null, updated_by: null };
  // Stored settings were validated on save; parsing again fills defaults for fields added later.
  const parsed = ProjectSettingsSchema.safeParse(data.settings ?? {});
  return {
    settings: parsed.success ? parsed.data : DEFAULT_PROJECT_SETTINGS,
    revision: data.revision, version_number: data.version_number, updated_at: data.updated_at, updated_by: data.updated_by,
  };
}
