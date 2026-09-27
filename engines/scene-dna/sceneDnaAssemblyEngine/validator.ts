import { SceneDnaAssemblyInputSchema } from "./input.schema";

export class SceneDnaAssemblyValidationError extends Error {
  code = "AURA-SDNA-010";
  constructor(public issues: unknown) {
    super("Invalid Scene DNA assembly input");
  }
}

export function validateSceneDnaAssemblyInput(input: unknown) {
  const r = SceneDnaAssemblyInputSchema.safeParse(input);
  if (!r.success) throw new SceneDnaAssemblyValidationError(r.error.issues);
  return r.data;
}
