// apps/api/src/modules/projects/projects.validator.ts
// Business invariants / readiness validation.
// Domain: Projects
// Canonical object: Project

import { CreateProjectInputSchema, UpdateProjectInputSchema } from "@aurastage/contracts";
import type { z } from "zod";

export class ProjectValidationError extends Error {
  code = "AURA-SCR-001"; // Scriptwriter subsystem: invalid project/story setup input
  issues: unknown;
  constructor(issues: unknown) {
    super("Invalid project input");
    this.issues = issues;
  }
}

export function validateCreateProjectInput(payload: unknown) {
  const result = CreateProjectInputSchema.safeParse(payload);
  if (!result.success) throw new ProjectValidationError(result.error.issues);
  return result.data;
}

export function validateUpdateProjectInput(payload: unknown): z.infer<typeof UpdateProjectInputSchema> {
  const result = UpdateProjectInputSchema.safeParse(payload);
  if (!result.success) throw new ProjectValidationError(result.error.issues);
  return result.data;
}
