import { IdentityResolutionInputSchema } from "./input.schema";

export class IdentityResolutionValidationError extends Error {
  code = "AURA-CHR-011";
  constructor(public issues: unknown) {
    super("Invalid identity resolution input");
  }
}

export function validateIdentityResolutionInput(input: unknown) {
  const r = IdentityResolutionInputSchema.safeParse(input);
  if (!r.success) throw new IdentityResolutionValidationError(r.error.issues);
  return r.data;
}
