// apps/api/src/modules/dialogue/dialogue.permissions.ts
// Domain: Dialogue Intelligence
// RLS (is_org_member) guards reads; the write functions re-check membership.
// These checks return a clean 403 before any work is done.
import type { SupabaseClient } from "@supabase/supabase-js";

export class DialogueForbiddenError extends Error {
  code = "AURA-DLG-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertVisible(db: SupabaseClient, table: string, id: string) {
  if (!UUID_RE.test(id)) throw new DialogueForbiddenError();
  const { data, error } = await db.from(table).select(table === "projects" ? "id" : "id, project_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new DialogueForbiddenError();
  return data as unknown as { id: string; project_id?: string };
}

export const assertProjectAccess = (db: SupabaseClient, projectId: string) => assertVisible(db, "projects", projectId);
export const assertLineAccess = (db: SupabaseClient, lineId: string) => assertVisible(db, "dialogue_lines", lineId);
export async function assertSceneInProject(db: SupabaseClient, projectId: string, sceneId: string) {
  const s = await assertVisible(db, "scenes", sceneId);
  if (s.project_id !== projectId) throw new DialogueForbiddenError();
}
