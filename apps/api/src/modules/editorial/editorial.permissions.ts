// apps/api/src/modules/editorial/editorial.permissions.ts
// Domain: Editorial & Timeline. RLS guards reads; the migration-0017 functions re-check membership.
import type { SupabaseClient } from "@supabase/supabase-js";

export class EditorialForbiddenError extends Error {
  code = "AURA-EDT-403";
  constructor(message = "Not found or not accessible") {
    super(message);
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function assertProjectAccess(db: SupabaseClient, id: string) {
  if (!UUID_RE.test(id)) throw new EditorialForbiddenError();
  const { data, error } = await db.from("projects").select("id, title, target_runtime_minutes").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new EditorialForbiddenError();
  return data as { id: string; title: string; target_runtime_minutes: number | null };
}
