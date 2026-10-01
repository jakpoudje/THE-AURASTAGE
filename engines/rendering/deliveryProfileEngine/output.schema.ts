import { z } from "zod";

export const VideoSpecSchema = z.object({
  codec: z.enum(["h264", "prores"]),
  width: z.number().int(),
  height: z.number().int(),
  pix_fmt: z.string(),
  /** Human description of quality settings. */
  quality: z.string(),
  color: z.literal("Rec.709 SDR"),
  /** "fill": centre-crop the 16:9 picture to the frame (vertical social); default "fit" (letterbox). */
  fit: z.enum(["fit", "fill"]).optional(),
});
export const AudioSpecSchema = z.object({
  codec: z.enum(["aac", "pcm_s24le"]),
  sample_rate: z.literal(48000),
  channels: z.literal(2),
  bitrate: z.string().nullable(),
});
export const DeliveryProfileSchema = z.object({
  id: z.string(),
  version: z.string(),
  label: z.string(),
  category: z.enum(["streaming", "review", "master", "audio", "subtitles", "editorial", "cinema", "broadcast", "social", "trailer"]),
  description: z.string(),
  available: z.boolean(),
  unavailable_reason: z.string().nullable(),
  container: z.enum(["mp4", "mov", "wav", "srt+vtt", "edl"]).nullable(),
  video: VideoSpecSchema.nullable(),
  audio: AudioSpecSchema.nullable(),
  /** EBU R128. Advisory: the render never re-levels an approved mix. */
  loudness: z.object({ integrated_lufs: z.number(), tolerance_lu: z.number(), max_true_peak_dbtp: z.number(), standard: z.string().optional() }).nullable(),
  /** File names (without the project prefix) this profile produces. */
  files: z.array(z.string()),
  supports: z.object({ watermark: z.boolean(), burn_timecode: z.boolean(), subtitles_sidecar: z.boolean() }),
});
export type DeliveryProfile = z.infer<typeof DeliveryProfileSchema>;
