import { ScreenplayImportInputSchema, type ScreenplayImportInput } from "./input.schema";

export class ScreenplayImportError extends Error {
  code = "AURA-SCR-020";
  constructor(message: string, public issues?: unknown) {
    super(message);
  }
}

export function validateScreenplayImportInput(input: unknown): ScreenplayImportInput {
  const result = ScreenplayImportInputSchema.safeParse(input);
  if (!result.success) throw new ScreenplayImportError("Invalid import input", result.error.issues);
  return result.data;
}
