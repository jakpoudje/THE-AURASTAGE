import { z } from "zod";

export const LoudnessInputSchema = z.object({
  sample_rate: z.number().int().min(8000).max(384000),
  /** One Float32Array per channel, equal length, samples in [-1, 1]. */
  channels: z.array(z.instanceof(Float32Array)).min(1).max(8),
  /** Per-channel weights (BS.1770: 1.0 for L/R/C, 1.41 for surrounds, 0 for LFE). Defaults to 1.0 each. */
  weights: z.array(z.number().min(0).max(2)).optional(),
});
export type LoudnessInput = z.input<typeof LoudnessInputSchema>;
