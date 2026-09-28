import { LoudnessInputSchema } from "./input.schema";

export class LoudnessValidationError extends Error {
  code = "AURA-AUD-010";
  constructor(public issues: unknown) {
    super("Invalid loudness input");
  }
}
export function validateLoudnessInput(input: unknown) {
  const r = LoudnessInputSchema.safeParse(input);
  if (!r.success) throw new LoudnessValidationError(r.error.issues);
  if (new Set(r.data.channels.map((c) => c.length)).size !== 1) throw new LoudnessValidationError([{ message: "channels differ in length" }]);
  return r.data;
}
