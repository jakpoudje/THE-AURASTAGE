// apps/api/src/modules/screenplay/screenplay.validator.ts
// Business invariants / readiness validation.
// Domain: Scriptwriter
// Canonical object: Script / Scene

import { ApproveScriptInputSchema, SaveScriptVersionInputSchema } from "@aurastage/contracts";
import { z } from "zod";

export class ScriptValidationError extends Error {
  code = "AURA-SCR-002";
  issues: unknown;
  constructor(issues: unknown, message = "Invalid script input") {
    super(message);
    this.issues = issues;
  }
}

export class ScriptConflictError extends Error {
  code = "AURA-SCR-409";
  constructor(message = "Someone saved a newer version since you opened this script. Reload to see it.") {
    super(message);
  }
}

export class ScriptNotFoundError extends Error {
  code = "AURA-SCR-404";
}

export function validateSaveInput(payload: unknown) {
  const r = SaveScriptVersionInputSchema.safeParse(payload);
  if (!r.success) throw new ScriptValidationError(r.error.issues);
  return r.data;
}

export function validateApproveInput(payload: unknown) {
  const r = ApproveScriptInputSchema.safeParse(payload);
  if (!r.success) throw new ScriptValidationError(r.error.issues);
  return r.data;
}

const ScopeQuerySchema = z.object({
  mean_scene_minutes: z.coerce.number().positive().max(30).optional(),
});

export function validateScopeQuery(query: unknown) {
  const r = ScopeQuerySchema.safeParse(query ?? {});
  if (!r.success) throw new ScriptValidationError(r.error.issues);
  return r.data;
}
