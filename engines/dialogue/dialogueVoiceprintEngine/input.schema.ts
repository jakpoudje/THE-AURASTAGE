import { z } from "zod";

export const VoiceprintInputSchema = z.object({
  lines: z.array(
    z.object({
      speaker_key: z.string(),
      speaker_name: z.string(),
      text: z.string(),
      scene_number: z.number().int().positive(),
      ordinal: z.number().int().positive(),
    })
  ),
});
export type VoiceprintInput = z.infer<typeof VoiceprintInputSchema>;
