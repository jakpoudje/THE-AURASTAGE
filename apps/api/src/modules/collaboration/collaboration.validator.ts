// apps/api/src/modules/collaboration/collaboration.validator.ts
// Business invariants / readiness validation.
// Domain: Team & Collaboration

import { CreateOrganizationInputSchema } from "@aurastage/contracts";

export class CollaborationValidationError extends Error {
  code = "AURA-MOS-001";
  issues: unknown;
  constructor(issues: unknown) {
    super("Invalid organization input");
    this.issues = issues;
  }
}

export function validateCreateOrganizationInput(payload: unknown) {
  const result = CreateOrganizationInputSchema.safeParse(payload);
  if (!result.success) throw new CollaborationValidationError(result.error.issues);
  return result.data;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "studio"}-${suffix}`;
}
