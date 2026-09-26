// apps/api/src/modules/projects/projects.mapper.ts
// Maps persistence rows to the shared @aurastage/contracts Project DTO.
// Domain: Projects

import { ProjectSchema, type Project } from "@aurastage/contracts";

export function toProjectDTO(row: unknown): Project {
  return ProjectSchema.parse(row);
}
