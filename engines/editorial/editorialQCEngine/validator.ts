import { EditorialQCInputSchema } from "./input.schema";

export class EditorialQCValidationError extends Error {
  code = "AURA-EDT-011";
  constructor(public issues: unknown) {
    super("Invalid editorial QC input");
  }
}
export function validateEditorialQCInput(input: unknown) {
  const r = EditorialQCInputSchema.safeParse(input);
  if (!r.success) throw new EditorialQCValidationError(r.error.issues);
  return r.data;
}
