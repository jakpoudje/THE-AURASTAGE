import { PictureLockInputSchema } from "./input.schema";

export class PictureLockValidationError extends Error {
  code = "AURA-EDT-011";
  constructor(public issues: unknown) {
    super("Invalid picture lock input");
  }
}
export function validatePictureLockInput(input: unknown) {
  const r = PictureLockInputSchema.safeParse(input);
  if (!r.success) throw new PictureLockValidationError(r.error.issues);
  return r.data;
}
