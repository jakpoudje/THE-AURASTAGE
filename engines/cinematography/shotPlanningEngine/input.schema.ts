import { z } from "zod";
import { CameraEnergySchema, CoverageStyleSchema, IntExtSchema } from "@aurastage/contracts";

export const ShotPlanningInputSchema = z.object({
  scene: z.object({
    number: z.number().int().positive(),
    heading: z.string(),
    int_ext: IntExtSchema,
    location: z.string(),
    time_of_day: z.string().nullable(),
    /** Intended story time Tₛ from the locked Scene DNA. */
    duration_seconds: z.number().positive(),
  }),
  dna: z.object({
    camera_energy: CameraEnergySchema.nullable(),
    mood: z.array(z.string()),
    lighting_intent: z.string().nullable(),
    /** What the scene is for / its atmosphere (1.3.0): read with the dialogue to tell a chase from a confession. */
    purpose: z.string().nullable().optional(),
    atmosphere: z.string().nullable().optional(),
  }),
  /** The film's genre (project genre + subgenre), e.g. "Political thriller" (1.3.0). null = drama grammar. */
  genre: z.string().nullable().optional(),
  participants: z.array(
    z.object({ character_id: z.string().uuid(), name: z.string(), presence: z.enum(["on_screen", "voice_only"]) })
  ),
  /** Dialogue lines of the locked Scene DNA, in script order. */
  lines: z.array(
    z.object({
      id: z.string().uuid(),
      character_id: z.string().uuid().nullable(),
      speaker: z.string(),
      text: z.string(),
      estimated_seconds: z.number().nonnegative(),
      intensity: z.number().int().nullable(),
      listener_ids: z.array(z.string().uuid()),
    })
  ),
  /** Coverage style chosen by the person (1.1.0); "standard" is the 1.0.0 plan. */
  style: CoverageStyleSchema.default("standard"),
});
export type ShotPlanningInput = z.input<typeof ShotPlanningInputSchema>;
