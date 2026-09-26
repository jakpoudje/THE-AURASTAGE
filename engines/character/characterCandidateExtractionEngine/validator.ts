import { CharacterExtractionInputSchema, type CharacterExtractionInput } from "./input.schema";

export class CharacterExtractionValidationError extends Error {
  code = "AURA-CHR-010";
  constructor(public issues: unknown) {
    super("Invalid character extraction input");
  }
}

export function validateCharacterExtractionInput(input: unknown): CharacterExtractionInput {
  const r = CharacterExtractionInputSchema.safeParse(input);
  if (!r.success) throw new CharacterExtractionValidationError(r.error.issues);
  return r.data;
}
