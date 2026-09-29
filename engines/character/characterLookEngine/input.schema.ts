import { z } from "zod";

export const LOOK_ANGLES = ["front", "three_quarter", "profile", "back"] as const;
export const LOOK_SIZES = ["CU", "MCU", "MS", "FULL"] as const;
export type LookAngle = (typeof LOOK_ANGLES)[number];
export type LookSize = (typeof LOOK_SIZES)[number];
/** The default reference set: the views storyboards and prompts use most. */
export const DEFAULT_VIEWS: [LookAngle, LookSize][] = [
  ["front", "CU"], ["front", "MS"], ["front", "FULL"], ["three_quarter", "MCU"], ["three_quarter", "FULL"], ["profile", "MCU"], ["profile", "FULL"], ["back", "FULL"],
];

const txt = (n: number) => z.string().max(n).nullable().optional();
export const CharacterLookInputSchema = z.object({
  character: z.object({
    name: z.string().min(1).max(120), age: txt(40), gender: txt(60), nationality: txt(100), occupation: txt(150), description: txt(2000), personality: txt(4000),
  }),
  wardrobe: z.object({ name: z.string().max(80), description: z.string().max(2000).nullable() }).nullable().default(null),
  /** The character at another point in the story (flashback, time jump): replaces the profile age (≥ 1.1.0). */
  age_state: z.object({ label: z.string().max(80), age: z.string().max(40), description: z.string().max(2000).nullable() }).nullable().default(null),
  /** Project look from Project Settings (style.look), so references match the film. */
  style: z.string().max(500).nullable().default(null),
  views: z.array(z.tuple([z.enum(LOOK_ANGLES), z.enum(LOOK_SIZES)])).min(1).max(16).optional(),
});
export type CharacterLookInput = z.input<typeof CharacterLookInputSchema>;
