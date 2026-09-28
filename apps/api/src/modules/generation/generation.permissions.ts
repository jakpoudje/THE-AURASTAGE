// apps/api/src/modules/generation/generation.permissions.ts
// Domain: Visual Generation
// RLS (is_org_member) guards reads; the migration-0013 functions re-check membership.
import type { SupabaseClient } from "@supabase/supabase-js";

export class GenerationForbiddenError extends Error {
  code = "AURA-GEN-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function visible(db: SupabaseClient, table: string, id: string, cols: string) {
  if (!UUID_RE.test(id)) throw new GenerationForbiddenError();
  const { data, error } = await db.from(table).select(cols).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new GenerationForbiddenError();
  return data as unknown as Record<string, string>;
}
export const assertProjectAccess = (db: SupabaseClient, projectId: string) => visible(db, "projects", projectId, "id");
export const assertPackageAccess = (db: SupabaseClient, id: string) => visible(db, "generation_packages", id, "id, project_id");
export const assertTakeAccess = (db: SupabaseClient, id: string) => visible(db, "takes", id, "id, project_id");
