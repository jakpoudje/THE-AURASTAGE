import { z } from "zod";
import { AudioFamilySchema } from "@aurastage/contracts";

export const MixTrackSchema = z.object({ id: z.string(), family: AudioFamilySchema, gain_db: z.number(), pan: z.number(), mute: z.boolean(), solo: z.boolean() });
export const MixClipSchema = z.object({
  track_id: z.string(), asset_id: z.string(), start_seconds: z.number(), duration_seconds: z.number(), offset_seconds: z.number(),
  gain_db: z.number(), fade_in_seconds: z.number(), fade_out_seconds: z.number(),
});
/** An approved scene mix (Audio Studio snapshot), only real recordings. */
export const SceneMixSchema = z.object({ seconds: z.number().positive(), tracks: z.array(MixTrackSchema), clips: z.array(MixClipSchema) });
export type SceneMix = z.infer<typeof SceneMixSchema>;
export const TimelineAudioEntrySchema = z.object({ record_in: z.number().int(), duration: z.number().int(), source_in: z.number().int(), mix_version_id: z.string() });
export type TimelineAudioEntry = z.infer<typeof TimelineAudioEntrySchema>;
/** DX/FX/BG/MX = department stems; ME = music & effects (everything but dialogue); null = full mix. */
export type MixBus = "DX" | "FX" | "BG" | "MX" | "ME" | null;
/** Decoded recording at the render sample rate (1 or 2 channels). */
export interface Pcm { channels: Float32Array[] }
