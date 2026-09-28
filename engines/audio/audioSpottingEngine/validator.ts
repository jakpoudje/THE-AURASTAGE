import { AudioSpottingInputSchema } from "./input.schema";

export class AudioSpottingValidationError extends Error {
  code = "AURA-AUD-011";
  constructor(public issues: unknown) {
    super("Invalid audio spotting input");
  }
}
export function validateAudioSpottingInput(input: unknown) {
  const r = AudioSpottingInputSchema.safeParse(input);
  if (!r.success) throw new AudioSpottingValidationError(r.error.issues);
  return r.data;
}
