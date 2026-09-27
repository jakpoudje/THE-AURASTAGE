import { BalanceInputSchema, type BalanceInput } from "./input.schema";

export class BalanceValidationError extends Error {
  code = "AURA-DLG-012";
  constructor(public issues: unknown) {
    super("Invalid dialogue balance input");
  }
}

export function validateBalanceInput(input: unknown): BalanceInput {
  const r = BalanceInputSchema.safeParse(input);
  if (!r.success) throw new BalanceValidationError(r.error.issues);
  return r.data;
}
