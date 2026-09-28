// apps/api/src/modules/audio/audio.permissions.ts
// Domain: Audio Studio. RLS guards reads; the migration-0015 functions re-check membership.
import type { SupabaseClient } from "@supabase/supabase-js";

export class AudioForbiddenError extends Error {
  code = "AURA-AUD-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function visible(db: SupabaseClient, table: string, id: string, cols: string) {
  if (!UUID_RE.test(id)) throw new AudioForbiddenError();
  const { data, error } = await db.from(table).select(cols).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AudioForbiddenError();
  return data as unknown as Record<string, string>;
}
export const assertProjectAccess = (db: SupabaseClient, id: string) => visible(db, "projects", id, "id");
export async function assertSceneInProject(db: SupabaseClient, projectId: string, sceneId: string) {
  const s = await visible(db, "scenes", sceneId, "id, project_id");
  if (s.project_id !== projectId) throw new AudioForbiddenError();
}
export const assertSessionAccess = (db: SupabaseClient, id: string) => visible(db, "audio_sessions", id, "id, project_id, scene_id");
export const assertTrackAccess = (db: SupabaseClient, id: string) => visible(db, "audio_tracks", id, "id, session_id");
export const assertClipAccess = (db: SupabaseClient, id: string) => visible(db, "audio_clips", id, "id, session_id");
