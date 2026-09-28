import { AssemblyInputSchema } from "./input.schema";

export class AssemblyValidationError extends Error {
  code = "AURA-EDT-011";
  constructor(public issues: unknown) {
    super("Invalid assembly input");
  }
}
export function validateAssemblyInput(input: unknown) {
  const r = AssemblyInputSchema.safeParse(input);
  if (!r.success) throw new AssemblyValidationError(r.error.issues);
  return r.data;
}
