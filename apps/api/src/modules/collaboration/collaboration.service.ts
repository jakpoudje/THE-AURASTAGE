// apps/api/src/modules/collaboration/collaboration.service.ts
// Domain workflow and transaction boundaries.
// Domain: Team & Collaboration

import type { SupabaseClient } from "@supabase/supabase-js";
import { createOrganization, getMyMemberships } from "./collaboration.repository";
import { toMembershipDTOs, toOrganizationDTO } from "./collaboration.mapper";
import { slugify, validateCreateOrganizationInput } from "./collaboration.validator";

export async function listMyOrganizations(db: SupabaseClient, userId: string) {
  const rows = await getMyMemberships(db, userId);
  return toMembershipDTOs(rows as never);
}

/**
 * Idempotent bootstrap: returns the caller's first organization if one
 * exists, otherwise creates one. This is what the web app's Dashboard calls
 * right after first sign-in so every user lands in a real org without a
 * separate "create your studio" step blocking the vertical slice.
 */
export async function bootstrapOrganization(db: SupabaseClient, userId: string, payload: unknown) {
  const existing = await getMyMemberships(db, userId);
  if (existing.length > 0) {
    return toOrganizationDTO(existing[0].organizations);
  }
  const input = validateCreateOrganizationInput(payload);
  const org = await createOrganization(db, input.name, slugify(input.name));
  return toOrganizationDTO(org);
}
