import { RuntimeScopeInputSchema, type RuntimeScopeInput } from "./input.schema";

export class RuntimeScopeValidationError extends Error {
  code = "AURA-SCR-012";
  constructor(public issues: unknown) {
    super("Invalid runtime scope input");
  }
}

export function validateRuntimeScopeInput(input: unknown): RuntimeScopeInput {
  const result = RuntimeScopeInputSchema.safeParse(input);
  if (!result.success) throw new RuntimeScopeValidationError(result.error.issues);
  return result.data;
}
