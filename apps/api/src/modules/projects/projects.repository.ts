// apps/api/src/modules/projects/projects.repository.ts
// Canonical persistence access for this domain.
// Domain: Projects
// Canonical object: Project
//
// All queries run through a per-request Supabase client carrying the caller's
// own access token, so Postgres RLS (is_org_member — packages/database
// migrations/0001) is the real authorization boundary. This repository never
// bypasses RLS with a service-role key (CLAUDE.md rule 4).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateProjectInput, UpdateProjectInput } from "@aurastage/contracts";
import { ForbiddenError } from "./projects.permissions";

const TABLE = "projects";

export async function listProjectsForOrg(db: SupabaseClient, orgId: string) {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProjectById(db: SupabaseClient, id: string) {
  const { data, error } = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertProject(db: SupabaseClient, input: CreateProjectInput, createdBy: string) {
  const { data, error } = await db
    .from(TABLE)
    .insert({ ...input, created_by: createdBy })
    .select("*")
    .single();
  // Since migration 0019 only studio owners, admins and producers may create projects (RLS).
  if (error?.code === "42501") throw new ForbiddenError("Only the studio's owners, admins and producers can create projects");
  if (error) throw error;
  return data;
}

export async function updateProject(db: SupabaseClient, id: string, input: UpdateProjectInput) {
  const { data, error } = await db.from(TABLE).update(input).eq("id", id).select("*").single();
  // RLS (project_can(settings, edit)) hides the row from people who can't edit it: no row comes back.
  if (error?.code === "PGRST116" || error?.code === "42501") throw new ForbiddenError("Your role can't change this project's settings");
  if (error) throw error;
  return data;
}
