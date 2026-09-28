// apps/api/src/modules/generation/generation.validator.ts
// Domain: Visual Generation
import { AspectRatioSchema, RequestTakeInputSchema } from "@aurastage/contracts";
import { z } from "zod";

export class GenerationValidationError extends Error {
  code = "AURA-GEN-002";
  constructor(public issues: unknown, message = "Invalid generation input") {
    super(message);
  }
}
export class GenerationNotFoundError extends Error {
  code = "AURA-GEN-404";
}
export class GenerationConflictError extends Error {
  code = "AURA-GEN-409";
}
export class GenerationNotReadyError extends Error {
  code = "AURA-GEN-412";
}

const FIELD: Record<string, string> = {
  provider: "Provider", model: "Model", capability: "Output type", aspect_ratio: "Aspect ratio",
  duration_seconds: "Duration", variations: "Variations", seed: "Seed", source_take_id: "Starting frame",
};
function parse<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const field = FIELD[String(first?.path[0] ?? "")] ?? "That value";
    throw new GenerationValidationError(r.error.issues, first?.code === "unrecognized_keys" ? "Unknown field" : `${field} isn't valid`);
  }
  return r.data;
}

export const validateRequestTakes = (p: unknown) => parse(RequestTakeInputSchema, p);
export const validateCompile = (p: unknown) => parse(z.object({ aspect_ratio: AspectRatioSchema.default("16:9") }).strict(), p);
