import { ShotPlanningInputSchema } from "./input.schema";

export class ShotPlanningValidationError extends Error {
  code = "AURA-SHOT-011";
  constructor(public issues: unknown) {
    super("Invalid shot planning input");
  }
}
export function validateShotPlanningInput(input: unknown) {
  const r = ShotPlanningInputSchema.safeParse(input);
  if (!r.success) throw new ShotPlanningValidationError(r.error.issues);
  return r.data;
}
