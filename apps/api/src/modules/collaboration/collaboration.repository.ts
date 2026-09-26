// apps/api/src/modules/collaboration/collaboration.repository.ts
// Canonical persistence access for this domain.
// Domain: Team & Collaboration
// Canonical object: Organization / OrgMember

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMyMemberships(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("org_members")
    .select("org_id, role, organizations(id, name, slug, created_at)")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

export async function createOrganization(db: SupabaseClient, name: string, slug: string) {
  const { data, error } = await db.rpc("create_organization", { org_name: name, org_slug: slug });
  if (error) throw error;
  return data;
}
