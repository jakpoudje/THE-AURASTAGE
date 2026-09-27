// apps/api/src/modules/scene-dna/sceneDna.validator.ts
// Business invariants / input validation.
// Domain: Scene DNA
import { UpdateSceneDnaInputSchema } from "@aurastage/contracts";
import type { ReadinessPredicate } from "@aurastage/contracts";

export class SceneDnaValidationError extends Error {
  code = "AURA-SDNA-002";
  constructor(public issues: unknown, message = "Invalid Scene DNA input") {
    super(message);
  }
}
export class SceneDnaNotFoundError extends Error {
  code = "AURA-SDNA-404";
}
export class SceneDnaConflictError extends Error {
  code = "AURA-SDNA-409";
}
export class SceneDnaNotReadyError extends Error {
  code = "AURA-SDNA-412";
  constructor(public issues: ReadinessPredicate[] | undefined, message: string) {
    super(message);
  }
}

const FIELD_LABEL: Record<string, string> = {
  purpose: "Purpose",
  stakes: "Stakes",
  story_time: "Story time",
  mood: "Mood",
  weather: "Weather",
  atmosphere: "Atmosphere",
  lighting_intent: "Lighting",
  sound_intent: "Sound",
  camera_energy: "Camera energy",
  wardrobe: "Wardrobe",
  notes: "Notes",
};

export function validateUpdateSceneDnaInput(payload: unknown) {
  const r = UpdateSceneDnaInputSchema.strict().safeParse(payload ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const field = FIELD_LABEL[String(first?.path[0] ?? "")] ?? "That value";
    const message =
      first?.code === "too_big" ? `${field} is too long` : first?.code === "unrecognized_keys" ? "Unknown field" : `${field} isn't valid`;
    throw new SceneDnaValidationError(r.error.issues, message);
  }
  return r.data;
}
