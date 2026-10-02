// apps/api/src/modules/runs/runs.errors.ts
// Domain: MOS — production runs. Operational errors carry the AURA-RUN prefix.
export class RunValidationError extends Error {
  code = "AURA-RUN-400";
  constructor(message: string, public issues: unknown[] = []) { super(message); }
}
export class RunForbiddenError extends Error {
  code = "AURA-RUN-403";
  constructor(message = "Not found or not accessible") { super(message); }
}
export class RunNotFoundError extends Error {
  code = "AURA-RUN-404";
}
