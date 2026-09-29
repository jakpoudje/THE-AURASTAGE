// apps/api/src/modules/characters/characters.permissions.ts
// Domain: Casting & Characters
//
// RLS (is_org_member) guards every read and the write functions re-check
// membership in their transaction; these checks give a clean 403/404 first.

import type { SupabaseClient } from "@supabase/supabase-js";

export class CharacterForbiddenError extends Error {
  code = "AURA-CHR-403";
  constructor(message = "Project not found or not accessible") {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

export async function assertProjectAccess(db: SupabaseClient, projectId: string) {
  if (!isUuid(projectId)) throw new CharacterForbiddenError();
  const { data, error } = await db.from("projects").select("id, org_id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CharacterForbiddenError();
  return data as { id: string; org_id: string };
}

/** Returns the character's project if the caller can see it. */
export async function assertCharacterAccess(db: SupabaseClient, characterId: string) {
  if (!isUuid(characterId)) throw new CharacterForbiddenError("Character not found or not accessible");
  const { data, error } = await db.from("characters").select("id, project_id").eq("id", characterId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CharacterForbiddenError("Character not found or not accessible");
  return data as { id: string; project_id: string };
}

/** Returns the row's project if the caller can see it (relationships / wardrobe looks). */
export async function assertRowAccess(db: SupabaseClient, table: "character_relationships" | "wardrobe_looks" | "character_age_states", id: string) {
  if (!isUuid(id)) throw new CharacterForbiddenError("Not found or not accessible");
  const { data, error } = await db.from(table).select("id, project_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new CharacterForbiddenError("Not found or not accessible");
  return data as { id: string; project_id: string };
}
