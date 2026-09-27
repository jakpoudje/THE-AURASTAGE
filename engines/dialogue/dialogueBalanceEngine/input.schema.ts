import { z } from "zod";

export const BalanceInputSchema = z.object({
  lines: z.array(
    z.object({
      scene_number: z.number().int().positive(),
      ordinal: z.number().int().positive(),
      speaker_key: z.string(),
      speaker_name: z.string(),
      word_count: z.number().int().nonnegative(),
      estimated_seconds: z.number().nonnegative(),
    })
  ),
});
export type BalanceInput = z.infer<typeof BalanceInputSchema>;
