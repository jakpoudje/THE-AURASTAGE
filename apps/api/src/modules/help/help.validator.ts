// Domain: Help & Support (SRS §13.4) and account security (SRS §18).
import type { ZodTypeAny, z } from "zod";

export class HelpValidationError extends Error {
  code = "AURA-HLP-400";
  constructor(public issues: unknown, message = "Invalid input") {
    super(message);
  }
}
export class HelpNotFoundError extends Error {
  code = "AURA-HLP-404";
}
export class HelpForbiddenError extends Error {
  code = "AURA-HLP-403";
}
export class HelpRateLimitError extends Error {
  code = "AURA-HLP-429";
}

export function parse<S extends ZodTypeAny>(schema: S, payload: unknown): z.infer<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) throw new HelpValidationError(r.error.issues, r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
