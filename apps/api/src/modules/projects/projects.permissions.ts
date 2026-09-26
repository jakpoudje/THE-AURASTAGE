// apps/api/src/modules/projects/projects.permissions.ts
// Domain-specific authorization checks.
// Domain: Projects
//
// Postgres RLS (is_org_member) is the enforced authorization boundary for
// every query in projects.repository.ts. This module exists for
// defense-in-depth / clearer error messages: a mutation that RLS would
// silently return 0 rows for instead surfaces a typed 403 here first.

import type { SupabaseClient } from "@supabase/supabase-js";

export class ForbiddenError extends Error {
  code = "AURA-SCR-403";
  constructor(message = "Not a member of this organization") {
    super(message);
  }
}

export async function assertOrgMember(db: SupabaseClient, orgId: string) {
  const { data, error } = await db.rpc("is_org_member", { check_org_id: orgId });
  if (error) throw error;
  if (!data) throw new ForbiddenError();
}
