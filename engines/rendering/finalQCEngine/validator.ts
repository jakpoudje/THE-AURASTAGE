import { FinalQCInputSchema } from "./input.schema";

export class FinalQCValidationError extends Error {
  code = "AURA-EXP-011";
  constructor(public issues: unknown) {
    super("Invalid final QC input");
  }
}
export function validateFinalQCInput(input: unknown) {
  const r = FinalQCInputSchema.safeParse(input);
  if (!r.success) throw new FinalQCValidationError(r.error.issues);
  return r.data;
}
