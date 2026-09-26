import { ScreenplayFormatInputSchema, type ScreenplayFormatInput } from "./input.schema";

export class ScreenplayFormatValidationError extends Error {
  code = "AURA-SCR-010";
  constructor(public issues: unknown) {
    super("Invalid screenplay format input");
  }
}

export function validateScreenplayFormatInput(input: unknown): ScreenplayFormatInput {
  const result = ScreenplayFormatInputSchema.safeParse(input);
  if (!result.success) throw new ScreenplayFormatValidationError(result.error.issues);
  return result.data;
}
