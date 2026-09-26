import { SceneBoundaryInputSchema, type SceneBoundaryInput } from "./input.schema";

export class SceneBoundaryValidationError extends Error {
  code = "AURA-SCR-011";
  constructor(public issues: unknown) {
    super("Invalid scene boundary input");
  }
}

export function validateSceneBoundaryInput(input: unknown): SceneBoundaryInput {
  const result = SceneBoundaryInputSchema.safeParse(input);
  if (!result.success) throw new SceneBoundaryValidationError(result.error.issues);
  return result.data;
}
