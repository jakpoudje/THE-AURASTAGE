// apps/api/src/modules/screenplay/screenplay.permissions.ts
// Domain-specific authorization checks.
// Domain: Scriptwriter
// Canonical object: Script / Scene
//
// RLS (is_org_member) guards every read, and the save/approve database
// functions re-check membership inside their transaction. This check exists so
// the API returns a clear 403/404 before any work is done.

import type { SupabaseClient } from "@supabase/supabase-js";

export class ScriptForbiddenError extends Error {
  code = "AURA-SCR-403";
  constructor(message = "You don't have access to this project") {
    super(message);
  }
}

/** Returns the project's org_id if the caller can see it (RLS hides other orgs' projects entirely). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assertProjectAccess(db: SupabaseClient, projectId: string) {
  if (!UUID_RE.test(projectId)) throw new ScriptForbiddenError("Project not found or not accessible");
  const { data, error } = await db.from("projects").select("id, org_id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ScriptForbiddenError("Project not found or not accessible");
  return data as { id: string; org_id: string };
}
