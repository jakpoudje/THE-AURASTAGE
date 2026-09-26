// apps/api/src/modules/projects/projects.service.ts
// Domain workflow and transaction boundaries.
// Domain: Projects
// Canonical object: Project

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateProjectInput, UpdateProjectInput } from "@aurastage/contracts";
import { assertOrgMember } from "./projects.permissions";
import {
  getProjectById,
  insertProject,
  listProjectsForOrg,
  updateProject,
} from "./projects.repository";
import { toProjectDTO } from "./projects.mapper";
import { validateCreateProjectInput, validateUpdateProjectInput } from "./projects.validator";

export async function listProjects(db: SupabaseClient, orgId: string) {
  await assertOrgMember(db, orgId);
  const rows = await listProjectsForOrg(db, orgId);
  return rows.map(toProjectDTO);
}

export async function getProject(db: SupabaseClient, id: string) {
  const row = await getProjectById(db, id);
  return row ? toProjectDTO(row) : null;
}

export async function createProject(db: SupabaseClient, payload: unknown, userId: string) {
  const input: CreateProjectInput = validateCreateProjectInput(payload);
  await assertOrgMember(db, input.org_id);
  const row = await insertProject(db, input, userId);
  return toProjectDTO(row);
}

export async function editProject(db: SupabaseClient, id: string, payload: unknown, orgId: string) {
  const input: UpdateProjectInput = validateUpdateProjectInput(payload);
  await assertOrgMember(db, orgId);
  const row = await updateProject(db, id, input);
  return toProjectDTO(row);
}
