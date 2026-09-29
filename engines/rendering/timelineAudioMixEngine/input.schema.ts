import { z } from "zod";
import { AudioFamilySchema, SessionMixSchema, TrackFxSchema } from "@aurastage/contracts";

/** An approved track: fader, pan, mute/solo and its channel strip (versions before migration 0029: neutral). */
export const MixTrackSchema = z.object({
  id: z.string(), family: AudioFamilySchema, gain_db: z.number(), pan: z.number(), mute: z.boolean(), solo: z.boolean(),
  fx: TrackFxSchema.default({}),
});
export const MixClipSchema = z.object({
  track_id: z.string(), asset_id: z.string(), start_seconds: z.number(), duration_seconds: z.number(), offset_seconds: z.number(),
  gain_db: z.number(), fade_in_seconds: z.number(), fade_out_seconds: z.number(),
});
/** An approved scene mix (Audio Studio snapshot): real recordings only, with the session routing. */
export const SceneMixSchema = z.object({
  seconds: z.number().positive(), tracks: z.array(MixTrackSchema), clips: z.array(MixClipSchema), mix: SessionMixSchema.default({}),
});
export type SceneMix = z.input<typeof SceneMixSchema>;
export const TimelineAudioEntrySchema = z.object({ record_in: z.number().int(), duration: z.number().int(), source_in: z.number().int(), mix_version_id: z.string() });
export type TimelineAudioEntry = z.infer<typeof TimelineAudioEntrySchema>;
/** DX/FX/BG/MX = department stems; ME = music & effects (everything but dialogue); null = full mix. */
export type MixBus = "DX" | "FX" | "BG" | "MX" | "ME" | null;
/** Decoded recording at the render sample rate (1 or 2 channels). */
export interface Pcm { channels: Float32Array[] }
