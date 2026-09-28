// apps/api/src/modules/audio/audio.validator.ts
// Domain: Audio Studio
import { LoudnessMeasurementInputSchema, SaveAudioClipInputSchema, UpdateAudioTrackInputSchema } from "@aurastage/contracts";
import { z } from "zod";

export class AudioValidationError extends Error {
  code = "AURA-AUD-002";
  constructor(public issues: unknown, message = "Invalid audio input") {
    super(message);
  }
}
export class AudioNotFoundError extends Error {
  code = "AURA-AUD-404";
}
export class AudioConflictError extends Error {
  code = "AURA-AUD-409";
}
export class AudioNotReadyError extends Error {
  code = "AURA-AUD-412";
  constructor(message: string, public issues?: unknown) {
    super(message);
  }
}

const FIELD: Record<string, string> = {
  name: "Name", gain_db: "Gain", pan: "Pan", mute: "Mute", solo: "Solo", track_id: "Track", label: "Label", asset_id: "Recording",
  start_seconds: "Start", duration_seconds: "Length", offset_seconds: "Offset", fade_in_seconds: "Fade in", fade_out_seconds: "Fade out",
};
function parse<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const f = FIELD[String(first?.path[0] ?? "")] ?? "That value";
    throw new AudioValidationError(r.error.issues, first?.code === "unrecognized_keys" ? "Unknown field" : first?.code === "too_big" ? `${f} is too high or too long` : first?.code === "too_small" ? `${f} is too low` : `${f} isn't valid`);
  }
  return r.data;
}
export const validateTrackPatch = (p: unknown) => parse(UpdateAudioTrackInputSchema, p);
export const validateClipPatch = (p: unknown) => parse(SaveAudioClipInputSchema, p);
export const validateMeasurement = (p: unknown) => parse(LoudnessMeasurementInputSchema, p);
