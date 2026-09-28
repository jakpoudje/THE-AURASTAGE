import { z } from "zod";
import { DeliveryProfileSchema } from "../deliveryProfileEngine/output.schema";

/** Facts measured on the produced files by the render worker (ffprobe, ebur128, sha256). */
export const MeasuredFileSchema = z.object({
  name: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().nullable(),
  video: z.object({ codec: z.string(), width: z.number(), height: z.number(), fps: z.number(), pix_fmt: z.string(), duration: z.number() }).nullable(),
  audio: z.object({ codec: z.string(), sample_rate: z.number(), channels: z.number(), duration: z.number() }).nullable(),
  loudness: z.object({ integrated_lufs: z.number().nullable(), true_peak_dbtp: z.number().nullable(), lra_lu: z.number().nullable() }).nullable(),
  /** Subtitle files: number of cues parsed back from the file. */
  cues: z.number().int().nullable(),
});
export type MeasuredFile = z.infer<typeof MeasuredFileSchema>;
export const FinalQCInputSchema = z.object({
  profile: DeliveryProfileSchema,
  fps: z.number().int(),
  duration_frames: z.number().int(),
  expected_files: z.array(z.string()),
  expected_cues: z.number().int().nullable(),
  files: z.array(MeasuredFileSchema),
});
