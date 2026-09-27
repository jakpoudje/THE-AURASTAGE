import { VoiceprintInputSchema, type VoiceprintInput } from "./input.schema";

export class VoiceprintValidationError extends Error {
  code = "AURA-DLG-011";
  constructor(public issues: unknown) {
    super("Invalid voiceprint input");
  }
}

export function validateVoiceprintInput(input: unknown): VoiceprintInput {
  const r = VoiceprintInputSchema.safeParse(input);
  if (!r.success) throw new VoiceprintValidationError(r.error.issues);
  return r.data;
}
