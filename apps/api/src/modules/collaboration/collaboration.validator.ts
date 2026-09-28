// apps/api/src/modules/collaboration/collaboration.validator.ts
// Business invariants / readiness validation.
// Domain: Team & Collaboration

import type { ZodTypeAny, z } from "zod";
import { CreateOrganizationInputSchema } from "@aurastage/contracts";

export class CollaborationValidationError extends Error {
  code = "AURA-COL-400";
  issues: unknown;
  constructor(issues: unknown, message = "Invalid input") {
    super(message);
    this.issues = issues;
  }
}
export class CollaborationNotFoundError extends Error {
  code = "AURA-COL-404";
}
export class CollaborationConflictError extends Error {
  code = "AURA-COL-409";
}
export class CollaborationGoneError extends Error {
  code = "AURA-COL-410";
}

export function parse<S extends ZodTypeAny>(schema: S, payload: unknown): z.infer<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) throw new CollaborationValidationError(r.error.issues, r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}

export function validateCreateOrganizationInput(payload: unknown) {
  const result = CreateOrganizationInputSchema.safeParse(payload);
  if (!result.success) throw Object.assign(new CollaborationValidationError(result.error.issues, "Invalid organization input"), { code: "AURA-MOS-001" });
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
