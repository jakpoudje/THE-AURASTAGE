import { z } from "zod";

// Canonical owner: Audio Studio (SRS §11). Dialogue Intelligence owns the words;
// Audio Studio owns their sonic realisation. Media bytes are Assets (Assets
// Library is canonical); sessions reference assets by id.

/** SRS §11 track families. */
export const AudioFamilySchema = z.enum(["DX", "ADR", "VO", "FOLEY", "FX", "WALLA", "BG", "MX", "SCORE"]);
export type AudioFamily = z.infer<typeof AudioFamilySchema>;

/** Department submix each family routes to (SRS §11 routing: tracks -> DX/FX/BG/MX -> print master). */
export const FAMILY_BUS: Record<AudioFamily, "DX" | "FX" | "BG" | "MX"> = {
  DX: "DX", ADR: "DX", VO: "DX", FOLEY: "FX", FX: "FX", WALLA: "FX", BG: "BG", MX: "MX", SCORE: "MX",
};

export const AudioTrackSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  ordinal: z.number().int(),
  name: z.string(),
  family: AudioFamilySchema,
  gain_db: z.number(),
  pan: z.number(),
  mute: z.boolean(),
  solo: z.boolean(),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

export const UpdateAudioTrackInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    gain_db: z.number().min(-60).max(12),
    pan: z.number().min(-1).max(1),
    mute: z.boolean(),
    solo: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateAudioTrackInput = z.infer<typeof UpdateAudioTrackInputSchema>;

export const AudioClipSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  track_id: z.string().uuid(),
  label: z.string(),
  /** cue = planned sound with no audio yet; asset = real audio from the Assets Library. */
  kind: z.enum(["cue", "asset"]),
  asset_id: z.string().uuid().nullable(),
  start_seconds: z.number(),
  duration_seconds: z.number(),
  offset_seconds: z.number(),
  gain_db: z.number(),
  fade_in_seconds: z.number(),
  fade_out_seconds: z.number(),
  source: z.record(z.unknown()),
  updated_at: z.string(),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const SaveAudioClipInputSchema = z
  .object({
    track_id: z.string().uuid(),
    label: z.string().trim().min(1).max(200),
    asset_id: z.string().uuid().nullable(),
    start_seconds: z.number().min(0).max(3600),
    duration_seconds: z.number().positive().max(3600),
    offset_seconds: z.number().min(0).max(3600),
    gain_db: z.number().min(-60).max(12),
    fade_in_seconds: z.number().min(0).max(60),
    fade_out_seconds: z.number().min(0).max(60),
  })
  .partial()
  .strict();
export type SaveAudioClipInput = z.infer<typeof SaveAudioClipInputSchema>;

/** A loudness measurement of the actually rendered mix (BS.1770-4). */
export const LoudnessMeasurementInputSchema = z
  .object({
    integrated_lufs: z.number().min(-120).max(10).nullable(),
    true_peak_dbtp: z.number().min(-120).max(20).nullable(),
    lra_lu: z.number().min(0).max(100).nullable(),
    duration_seconds: z.number().positive(),
    clip_count: z.number().int().nonnegative(),
    engine_version: z.string().min(1).max(20),
    /** The session edit stamp the mix was rendered from (proves it matches what's saved). */
    session_revision: z.string().min(1).max(64),
  })
  .strict();
export type LoudnessMeasurementInput = z.infer<typeof LoudnessMeasurementInputSchema>;

/** Delivery targets (EBU R128 broadcast default; people can change per project later). */
export const LOUDNESS_TARGET = { integrated_lufs: -23, tolerance_lu: 1, max_true_peak_dbtp: -1 } as const;
