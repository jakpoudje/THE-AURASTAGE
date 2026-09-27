// apps/api/src/modules/shots/shots.validator.ts
// Domain: Storyboard & Shots
import { CreateShotInputSchema, UpdateShotInputSchema } from "@aurastage/contracts";
import type { ReadinessPredicate } from "@aurastage/contracts";
import { z } from "zod";

export class ShotValidationError extends Error {
  code = "AURA-SHOT-002";
  constructor(public issues: unknown, message = "Invalid shot input") {
    super(message);
  }
}
export class ShotNotFoundError extends Error {
  code = "AURA-SHOT-404";
}
export class ShotConflictError extends Error {
  code = "AURA-SHOT-409";
}
export class ShotNotReadyError extends Error {
  code = "AURA-SHOT-412";
  constructor(message: string, public issues?: ReadinessPredicate[]) {
    super(message);
  }
}

const FIELD: Record<string, string> = {
  purpose: "Purpose", size: "Shot size", angle: "Angle", movement: "Movement", support: "Camera support", focus: "Focus",
  lens_mm: "Lens (mm)", duration_seconds: "Duration", description: "Description", composition: "Composition",
  lighting: "Lighting", transition_in: "Transition", notes: "Notes", story_start: "Starts at", story_end: "Ends at",
  character_ids: "Characters", dialogue_line_ids: "Dialogue lines",
};

function parse<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const field = FIELD[String(first?.path[0] ?? "")] ?? "That value";
    const message =
      first?.message === "A shot can't end before it starts"
        ? first.message
        : first?.code === "too_big" ? `${field} is too large or too long`
        : first?.code === "too_small" ? `${field} is too small or empty`
        : first?.code === "unrecognized_keys" ? "Unknown field"
        : `${field} isn't valid`;
    throw new ShotValidationError(r.error.issues, message);
  }
  return r.data;
}

export const validateCreateShot = (p: unknown) => parse(CreateShotInputSchema, p);
export const validateUpdateShot = (p: unknown) => parse(UpdateShotInputSchema.strict(), p);
export const validateGenerate = (p: unknown) => parse(z.object({ replace: z.boolean().default(false) }).strict(), p);
export const validateAdd = (p: unknown) =>
  parse(z.object({ shot: z.unknown(), after_ordinal: z.number().int().nonnegative().nullable().default(null) }).strict(), p);
export const validateMove = (p: unknown) => parse(z.object({ direction: z.union([z.literal(-1), z.literal(1)]) }).strict(), p);
