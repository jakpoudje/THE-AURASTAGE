import { CoverageInputSchema } from "./input.schema";

export class CoverageValidationError extends Error {
  code = "AURA-SHOT-010";
  constructor(public issues: unknown) {
    super("Invalid coverage input");
  }
}
export function validateCoverageInput(input: unknown) {
  const r = CoverageInputSchema.safeParse(input);
  if (!r.success) throw new CoverageValidationError(r.error.issues);
  return r.data;
}
