// apps/api/src/modules/shots/shots.permissions.ts
// Domain: Storyboard & Shots
// RLS (is_org_member) guards reads; the migration-0012 write functions re-check
// membership. These checks return a clean 403 before any work is done.
import type { SupabaseClient } from "@supabase/supabase-js";

export class ShotForbiddenError extends Error {
  code = "AURA-SHOT-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function visible(db: SupabaseClient, table: string, id: string, cols: string) {
  if (!UUID_RE.test(id)) throw new ShotForbiddenError();
  const { data, error } = await db.from(table).select(cols).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ShotForbiddenError();
  return data as unknown as Record<string, string>;
}

export const assertProjectAccess = (db: SupabaseClient, projectId: string) => visible(db, "projects", projectId, "id");
export async function assertSceneInProject(db: SupabaseClient, projectId: string, sceneId: string) {
  const s = await visible(db, "scenes", sceneId, "id, project_id");
  if (s.project_id !== projectId) throw new ShotForbiddenError();
}
export const assertShotAccess = (db: SupabaseClient, shotId: string) => visible(db, "shots", shotId, "id, project_id, scene_id");
