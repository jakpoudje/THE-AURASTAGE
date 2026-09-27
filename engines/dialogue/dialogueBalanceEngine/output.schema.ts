import { z } from "zod";

export const SceneBalanceSchema = z.object({
  scene_number: z.number().int().positive(),
  lines: z.number().int(),
  words: z.number().int(),
  dialogue_seconds: z.number(),
  speakers: z.array(
    z.object({ speaker_key: z.string(), speaker_name: z.string(), lines: z.number().int(), words: z.number().int(), share: z.number() })
  ),
  flags: z.array(
    z.object({
      kind: z.enum(["dominant_speaker", "long_speech", "single_speaker"]),
      message: z.string(),
      ordinal: z.number().int().optional(),
    })
  ),
});
export type SceneBalance = z.infer<typeof SceneBalanceSchema>;

export const BalanceOutputSchema = z.object({ scenes: z.array(SceneBalanceSchema), engine_version: z.string() });
export type BalanceOutput = z.infer<typeof BalanceOutputSchema>;
