import { DialogueExtractionInputSchema, type DialogueExtractionInput } from "./input.schema";

export class DialogueExtractionValidationError extends Error {
  code = "AURA-DLG-010";
  constructor(public issues: unknown) {
    super("Invalid dialogue extraction input");
  }
}

export function validateDialogueExtractionInput(input: unknown): DialogueExtractionInput {
  const r = DialogueExtractionInputSchema.safeParse(input);
  if (!r.success) throw new DialogueExtractionValidationError(r.error.issues);
  return r.data;
}
