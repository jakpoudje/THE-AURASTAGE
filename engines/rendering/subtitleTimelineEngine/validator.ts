import { SubtitleInputSchema } from "./input.schema";

export class SubtitleValidationError extends Error {
  code = "AURA-EXP-011";
  constructor(public issues: unknown) {
    super("Invalid subtitle input");
  }
}
export function validateSubtitleInput(input: unknown) {
  const r = SubtitleInputSchema.safeParse(input);
  if (!r.success) throw new SubtitleValidationError(r.error.issues);
  return r.data;
}
