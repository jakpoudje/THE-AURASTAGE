// apps/api/src/modules/dialogue/dialogue.validator.ts
// Domain: Dialogue Intelligence
import { UpdateDialogueLineInputSchema } from "@aurastage/contracts";

export class DialogueValidationError extends Error {
  code = "AURA-DLG-002";
  constructor(public issues: unknown, message = "Invalid dialogue input") {
    super(message);
  }
}
export class DialogueConflictError extends Error {
  code = "AURA-DLG-409";
}
export class DialogueNotFoundError extends Error {
  code = "AURA-DLG-404";
}
export class DialogueScriptNotApprovedError extends Error {
  code = "AURA-DLG-412";
  constructor() {
    super("Approve the script in Scriptwriter first — dialogue is built from the approved script.");
  }
}

export function validateUpdateLineInput(payload: unknown) {
  const r = UpdateDialogueLineInputSchema.safeParse(payload ?? {});
  if (!r.success) throw new DialogueValidationError(r.error.issues, r.error.issues[0]?.message ?? "Invalid dialogue input");
  return r.data;
}
