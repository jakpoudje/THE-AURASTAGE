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

// ---- Studio processing (migration 0029). Every value is bounded; missing = neutral (no effect). ----
/** Per-track channel strip: filter, 3-band EQ, compressor, effect sends and volume automation. */
export const TrackFxSchema = z.object({
  hpf_hz: z.number().min(0).max(500).default(0),
  eq: z.object({
    low: z.object({ freq: z.number().min(40).max(500), gain_db: z.number().min(-15).max(15) }).default({ freq: 120, gain_db: 0 }),
    mid: z.object({ freq: z.number().min(150).max(8000), gain_db: z.number().min(-15).max(15), q: z.number().min(0.3).max(8) }).default({ freq: 1500, gain_db: 0, q: 1 }),
    high: z.object({ freq: z.number().min(1500).max(16000), gain_db: z.number().min(-15).max(15) }).default({ freq: 8000, gain_db: 0 }),
  }).default({}),
  comp: z.object({
    on: z.boolean(), threshold_db: z.number().min(-60).max(0), ratio: z.number().min(1).max(20),
    attack_ms: z.number().min(0.5).max(200), release_ms: z.number().min(10).max(1000), makeup_db: z.number().min(0).max(24),
  }).default({ on: false, threshold_db: -18, ratio: 3, attack_ms: 10, release_ms: 150, makeup_db: 0 }),
  /** Post-fader send levels to the shared reverb and delay (dB; -60 = off). */
  reverb_send_db: z.number().min(-60).max(6).default(-60),
  delay_send_db: z.number().min(-60).max(6).default(-60),
  /** Volume automation on top of the fader: points in scene seconds, joined by straight ramps. */
  automation: z.array(z.object({ t: z.number().min(0).max(36000), db: z.number().min(-60).max(12) })).max(400).default([]),
});
export type TrackFx = z.infer<typeof TrackFxSchema>;
export const NEUTRAL_TRACK_FX: TrackFx = TrackFxSchema.parse({});

/** Session-level routing: department buses, shared reverb and delay, and the master with its limiter. */
export const SessionMixSchema = z.object({
  buses: z.object({
    DX: z.object({ gain_db: z.number().min(-60).max(12), mute: z.boolean() }).default({ gain_db: 0, mute: false }),
    FX: z.object({ gain_db: z.number().min(-60).max(12), mute: z.boolean() }).default({ gain_db: 0, mute: false }),
    BG: z.object({ gain_db: z.number().min(-60).max(12), mute: z.boolean() }).default({ gain_db: 0, mute: false }),
    MX: z.object({ gain_db: z.number().min(-60).max(12), mute: z.boolean() }).default({ gain_db: 0, mute: false }),
  }).default({}),
  reverb: z.object({ type: z.enum(["room", "hall", "plate"]), decay_s: z.number().min(0.2).max(8), pre_delay_ms: z.number().min(0).max(200), return_db: z.number().min(-60).max(6) })
    .default({ type: "room", decay_s: 1.2, pre_delay_ms: 15, return_db: 0 }),
  delay: z.object({ time_ms: z.number().min(20).max(2000), feedback: z.number().min(0).max(0.9), return_db: z.number().min(-60).max(6) })
    .default({ time_ms: 320, feedback: 0.3, return_db: 0 }),
  master: z.object({ gain_db: z.number().min(-24).max(24), limiter: z.boolean(), ceiling_db: z.number().min(-12).max(0) })
    .default({ gain_db: 0, limiter: true, ceiling_db: -1 }),
});
export type SessionMix = z.infer<typeof SessionMixSchema>;
export const NEUTRAL_SESSION_MIX: SessionMix = SessionMixSchema.parse({});
export const UpdateAudioMixInputSchema = z.object({ mix: SessionMixSchema, revision: z.string().uuid() }).strict();
export type UpdateAudioMixInput = z.infer<typeof UpdateAudioMixInputSchema>;

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
  /** Channel strip processing; tracks saved before migration 0029 read as neutral. */
  fx: TrackFxSchema.default({}),
  /** Added by a person (migration 0031): never removed by re-spotting; can be removed when empty. */
  added_by_hand: z.boolean().default(false),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

/** A track a person adds to a scene's session (placed last, or right after `after_track_id`). */
export const AddAudioTrackInputSchema = z
  .object({ name: z.string().trim().min(1).max(80), family: AudioFamilySchema, after_track_id: z.string().uuid().optional() })
  .strict();
export type AddAudioTrackInput = z.infer<typeof AddAudioTrackInputSchema>;
export const MoveAudioTrackInputSchema = z.object({ direction: z.union([z.literal(-1), z.literal(1)]) }).strict();

export const UpdateAudioTrackInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    gain_db: z.number().min(-60).max(12),
    pan: z.number().min(-1).max(1),
    mute: z.boolean(),
    solo: z.boolean(),
    fx: TrackFxSchema,
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
