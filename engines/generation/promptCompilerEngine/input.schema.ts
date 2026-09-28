import { z } from "zod";
import { AspectRatioSchema } from "@aurastage/contracts";

export const PromptCompilerInputSchema = z.object({
  project: z.object({
    title: z.string(),
    genre: z.string().nullable(),
    tone: z.string().nullable(),
    setting: z.string().nullable(),
    time_period: z.string().nullable(),
  }),
  scene: z.object({
    number: z.number().int(),
    heading: z.string(),
    location: z.string(),
    int_ext: z.string(),
    time_of_day: z.string().nullable(),
    purpose: z.string().nullable(),
    mood: z.array(z.string()),
    weather: z.string().nullable(),
    atmosphere: z.string().nullable(),
    lighting_intent: z.string().nullable(),
  }),
  /** The shot exactly as it is in the approved shot plan version. */
  shot: z.object({
    id: z.string().uuid(),
    size: z.string(),
    angle: z.string(),
    movement: z.string(),
    focus: z.string(),
    lens_mm: z.number().nullable(),
    duration_seconds: z.number(),
    description: z.string(),
    composition: z.string().nullable(),
    lighting: z.string().nullable(),
    character_ids: z.array(z.string().uuid()),
    dialogue_line_ids: z.array(z.string().uuid()),
  }),
  characters: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      age: z.string().nullable(),
      description: z.string().nullable(),
      wardrobe: z.string().nullable(),
    })
  ),
  dialogue: z.array(z.object({ id: z.string().uuid(), speaker: z.string(), text: z.string(), emotion: z.string().nullable() })),
  aspect_ratio: AspectRatioSchema,
  provenance: z.object({
    shot_plan_version_id: z.string().uuid(),
    scene_dna_version_id: z.string().uuid(),
    script_version_id: z.string().uuid().nullable(),
  }),
});
export type PromptCompilerInput = z.input<typeof PromptCompilerInputSchema>;
