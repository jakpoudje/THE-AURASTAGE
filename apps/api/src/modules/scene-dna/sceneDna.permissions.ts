// apps/api/src/modules/scene-dna/sceneDna.permissions.ts
// Domain: Scene DNA
// RLS (is_org_member) guards reads; the migration-0011 write functions re-check
// membership. These checks return a clean 403 before any work is done.
import type { SupabaseClient } from "@supabase/supabase-js";

export class SceneDnaForbiddenError extends Error {
  code = "AURA-SDNA-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assertProjectAccess(db: SupabaseClient, projectId: string) {
  if (!UUID_RE.test(projectId)) throw new SceneDnaForbiddenError();
  const { data, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new SceneDnaForbiddenError();
}

export async function assertSceneInProject(db: SupabaseClient, projectId: string, sceneId: string) {
  if (!UUID_RE.test(sceneId)) throw new SceneDnaForbiddenError();
  const { data, error } = await db.from("scenes").select("id, project_id").eq("id", sceneId).maybeSingle();
  if (error) throw error;
  if (!data || (data as { project_id: string }).project_id !== projectId) throw new SceneDnaForbiddenError();
}
