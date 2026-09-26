// apps/api/src/modules/projects/projects.validator.ts
// Business invariants / readiness validation.
// Domain: Projects
// Canonical object: Project

import { CreateProjectInputSchema, UpdateProjectInputSchema } from "@aurastage/contracts";
import type { z } from "zod";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  logline: "Logline",
  synopsis: "Synopsis",
  genre: "Genre",
  subgenre: "Subgenre",
  setting: "Setting",
  time_period: "Time period",
  target_runtime_minutes: "Target runtime",
  org_id: "Studio",
};

/** Plain-language summary of validation issues, e.g. "Logline: must be 500 characters or fewer". */
export function describeIssues(issues: z.ZodIssue[]): string {
  const parts = issues.slice(0, 3).map((i) => {
    const field = FIELD_LABELS[String(i.path[0])] ?? String(i.path[0] ?? "Input");
    return i.message.startsWith(field) ? i.message : `${field}: ${i.message}`;
  });
  return parts.length ? parts.join("; ") : "Invalid project input";
}

export class ProjectValidationError extends Error {
  code = "AURA-SCR-001"; // Scriptwriter subsystem: invalid project/story setup input
  issues: unknown;
  constructor(issues: z.ZodIssue[]) {
    super(describeIssues(issues));
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
