import { z } from "zod";
import { AspectRatioSchema } from "@aurastage/contracts";

export const PromptCompilerInputSchema = z.object({
  project: z.object({
    title: z.string(),
    genre: z.string().nullable(),
    tone: z.string().nullable(),
    setting: z.string().nullable(),
    time_period: z.string().nullable(),
    /** Project Settings look, added to every prompt (null when not set). */
    look: z.string().nullable().default(null),
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
      /** As written in Casting ("Woman", "Man", "Non-binary"); shown in the prompt and used by AuraSketch (≥ 1.4.0). */
      gender: z.string().nullable().default(null),
      /** The character at another point in the story in this scene; `age` is then that age (≥ 1.3.0). */
      age_state: z.object({ id: z.string().uuid(), label: z.string(), description: z.string().nullable() }).nullable().default(null),
    })
  ),
  dialogue: z.array(z.object({ id: z.string().uuid(), speaker: z.string(), text: z.string(), emotion: z.string().nullable() })),
  /** The scene's canonical location (Locations & Props) — null when it hasn't been found/described yet. */
  location: z.object({ id: z.string().uuid(), name: z.string(), description: z.string(), revision: z.number().int() }).nullable().default(null),
  /** Props and vehicles that appear in the scene. */
  props: z.array(z.object({ id: z.string().uuid(), name: z.string(), description: z.string(), category: z.string(), revision: z.number().int() })).default([]),
  /** Finished reference images to condition on (characters in frame, the location at this time of day, the props). */
  references: z.array(z.object({ kind: z.enum(["character", "location", "prop"]), object_id: z.string().uuid(), name: z.string(), view: z.string(), asset_id: z.string().uuid() })).default([]),
  aspect_ratio: AspectRatioSchema,
  provenance: z.object({
    shot_plan_version_id: z.string().uuid(),
    scene_dna_version_id: z.string().uuid(),
    script_version_id: z.string().uuid().nullable(),
    /** Project Settings version the look was read from. */
    settings_version: z.number().int().nullable().default(null),
  }),
});
export type PromptCompilerInput = z.input<typeof PromptCompilerInputSchema>;
