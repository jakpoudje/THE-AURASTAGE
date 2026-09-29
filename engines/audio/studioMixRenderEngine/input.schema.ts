import { z } from "zod";
import { AudioFamilySchema, SessionMixSchema, TrackFxSchema } from "@aurastage/contracts";

const num = z.coerce.number();
/** A track as approved (Audio Studio snapshot): fader, pan, mute/solo and its channel strip. Missing fx = neutral. */
export const StudioTrackSchema = z.object({
  id: z.string(), family: AudioFamilySchema, gain_db: num, pan: num, mute: z.boolean(), solo: z.boolean(),
  fx: TrackFxSchema.default({}),
});
/** A placed recording (planned cues make no sound and are not passed). */
export const StudioClipSchema = z.object({
  track_id: z.string(), asset_id: z.string(), start_seconds: num, duration_seconds: num, offset_seconds: num,
  gain_db: num, fade_in_seconds: num, fade_out_seconds: num,
});
export const StudioMixSchema = z.object({
  seconds: z.number().positive(),
  tracks: z.array(StudioTrackSchema),
  clips: z.array(StudioClipSchema),
  /** Session routing; versions approved before migration 0029 read as neutral. */
  mix: SessionMixSchema.default({}),
});
export type StudioTrack = z.infer<typeof StudioTrackSchema>;
export type StudioClip = z.infer<typeof StudioClipSchema>;
export type StudioMix = z.infer<typeof StudioMixSchema>;
/** DX/FX/BG/MX = one department stem; ME = everything but dialogue; null = the full mix. */
export type StudioBus = "DX" | "FX" | "BG" | "MX" | "ME" | null;
/** Decoded recording at the render sample rate (1 or 2 channels). */
export interface Pcm { channels: Float32Array[] }
