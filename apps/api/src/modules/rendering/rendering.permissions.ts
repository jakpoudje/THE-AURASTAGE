// apps/api/src/modules/rendering/rendering.permissions.ts
// Domain: Export & Deliver. RLS guards reads; the migration-0018 functions re-check membership.
import type { SupabaseClient } from "@supabase/supabase-js";

export class RenderingForbiddenError extends Error {
  code = "AURA-EXP-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function visible<T>(db: SupabaseClient, table: string, id: string, cols: string): Promise<T> {
  if (!UUID_RE.test(id)) throw new RenderingForbiddenError();
  const { data, error } = await db.from(table).select(cols).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new RenderingForbiddenError();
  return data as T;
}
export const assertProjectAccess = (db: SupabaseClient, id: string) => visible<{ id: string; title: string; org_id: string; genre: string | null; tone: string | null; logline: string | null }>(db, "projects", id, "id, title, org_id, genre, tone, logline");
export const assertRenderAccess = (db: SupabaseClient, id: string) => visible<Record<string, any>>(db, "renders", id, "*");
