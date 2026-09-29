// apps/api/src/modules/editorial/editorial.validator.ts
// Domain: Editorial & Timeline
import { AssembleRequestSchema, EditRequestSchema, PictureLockRequestSchema, RestoreTimelineVersionSchema, SaveTimelineVersionSchema, SaveTimelineAutomationSchema } from "@aurastage/contracts";
import { z } from "zod";

export class EditorialValidationError extends Error {
  code = "AURA-EDT-002";
  constructor(public issues: unknown, message = "Invalid timeline input") {
    super(message);
  }
}
export class EditorialNotFoundError extends Error {
  code = "AURA-EDT-404";
}
export class EditorialConflictError extends Error {
  code = "AURA-EDT-409";
}
export class EditorialNotReadyError extends Error {
  code = "AURA-EDT-412";
  constructor(message: string, public issues?: unknown) {
    super(message);
  }
}
/** The picture is locked: the edit needs an explicit break. `issues` carries the impact analysis. */
export class EditorialLockedError extends Error {
  code = "AURA-EDT-423";
  constructor(message: string, public issues: unknown) {
    super(message);
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    throw new EditorialValidationError(r.error.issues, first?.code === "unrecognized_keys" ? "Unknown field" : `${first?.path.join(".") || "That value"} isn't valid`);
  }
  return r.data;
}
export const validateEditRequest = (p: unknown) => parse(EditRequestSchema, p);
export const validateAssemble = (p: unknown) => parse(AssembleRequestSchema, p);
export const validateSaveVersion = (p: unknown) => parse(SaveTimelineVersionSchema, p);
export const validateRestore = (p: unknown) => parse(RestoreTimelineVersionSchema, p);
export const validateLock = (p: unknown) => parse(PictureLockRequestSchema, p);
export const validateAutomation = (p: unknown) => parse(SaveTimelineAutomationSchema, p);
