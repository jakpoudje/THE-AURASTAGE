import { EditDecisionInputSchema } from "./input.schema";

export class EditDecisionValidationError extends Error {
  code = "AURA-EDT-011";
  constructor(public issues: unknown) {
    super("Invalid edit input");
  }
}
/** The edit is well-formed but not possible on this timeline (explained in plain language). */
export class EditRejectedError extends Error {
  code = "AURA-EDT-409";
}
export function validateEditDecisionInput(input: unknown) {
  const r = EditDecisionInputSchema.safeParse(input);
  if (!r.success) throw new EditDecisionValidationError(r.error.issues);
  return r.data;
}
