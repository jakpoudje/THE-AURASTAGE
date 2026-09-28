import { PromptCompilerInputSchema } from "./input.schema";

export class PromptCompilerValidationError extends Error {
  code = "AURA-GEN-010";
  constructor(public issues: unknown) {
    super("Invalid prompt compiler input");
  }
}
export function validatePromptCompilerInput(input: unknown) {
  const r = PromptCompilerInputSchema.safeParse(input);
  if (!r.success) throw new PromptCompilerValidationError(r.error.issues);
  return r.data;
}
