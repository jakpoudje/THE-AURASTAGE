import { z } from "zod";

export const LoudnessOutputSchema = z.object({
  /** Integrated loudness in LUFS (LKFS); null when everything is below the -70 LUFS gate (silence). */
  integrated_lufs: z.number().nullable(),
  /** True peak in dBTP (4x oversampled); null for digital silence. */
  true_peak_dbtp: z.number().nullable(),
  /** Sample peak in dBFS. */
  sample_peak_dbfs: z.number().nullable(),
  /** Loudness range in LU (EBU Tech 3342); null when too short/quiet. */
  lra_lu: z.number().nullable(),
  duration_seconds: z.number(),
  engine_version: z.string(),
});
export type LoudnessOutput = z.infer<typeof LoudnessOutputSchema>;
