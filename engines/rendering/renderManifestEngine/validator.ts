import { RenderManifestInputSchema } from "./input.schema";

export class RenderManifestValidationError extends Error {
  code = "AURA-EXP-011";
  constructor(public issues: unknown) {
    super("Invalid render manifest input");
  }
}
export function validateRenderManifestInput(input: unknown) {
  const r = RenderManifestInputSchema.safeParse(input);
  if (!r.success) throw new RenderManifestValidationError(r.error.issues);
  return r.data;
}
