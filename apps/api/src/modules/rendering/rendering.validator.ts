// apps/api/src/modules/rendering/rendering.validator.ts
// Domain: Export & Deliver
import { CreateRenderInputSchema } from "@aurastage/contracts";

export class RenderingValidationError extends Error {
  code = "AURA-EXP-002";
  constructor(public issues: unknown, message = "Invalid delivery input") {
    super(message);
  }
}
export class RenderingNotFoundError extends Error {
  code = "AURA-EXP-404";
}
export class RenderingConflictError extends Error {
  code = "AURA-EXP-409";
}
export class RenderingNotReadyError extends Error {
  code = "AURA-EXP-412";
  constructor(message: string, public issues?: unknown) {
    super(message);
  }
}
export function validateCreateRender(payload: unknown) {
  const r = CreateRenderInputSchema.safeParse(payload ?? {});
  if (!r.success) throw new RenderingValidationError(r.error.issues, r.error.issues[0]?.path[0] === "profile_id" ? "Choose a delivery format" : "That setting isn't valid");
  return r.data;
}
