import { z } from "zod";
import { IntExtSchema, SceneDnaEditableSchema } from "@aurastage/contracts";

const AdjacentSceneSchema = z.object({
  number: z.number().int().positive(),
  heading: z.string(),
  location: z.string(),
  time_of_day: z.string().nullable(),
  int_ext: IntExtSchema,
});

export const SceneDnaAssemblyInputSchema = z.object({
  scene: z.object({
    id: z.string().uuid(),
    number: z.number().int().positive(),
    heading: z.string(),
    int_ext: IntExtSchema,
    location: z.string(),
    time_of_day: z.string().nullable(),
    estimated_seconds: z.number().nonnegative(),
    status: z.enum(["active", "omitted"]),
  }),
  /** Action text of this scene from the approved script version, with source lines. */
  action: z.array(z.object({ line: z.number().int().positive(), text: z.string() })),
  participants: z.array(
    z.object({
      character_id: z.string().uuid(),
      name: z.string(),
      kind: z.enum(["individual", "group"]),
      status: z.enum(["draft", "approved"]),
      voice_only: z.boolean(),
      speaking: z.boolean(),
      line_count: z.number().int().nonnegative(),
    })
  ),
  dialogue: z.array(
    z.object({
      id: z.string().uuid(),
      speaker: z.string(),
      character_id: z.string().uuid().nullable(),
      emotion: z.string().nullable(),
      intensity: z.number().int().nullable(),
      approval: z.enum(["draft", "approved"]),
      review_state: z.enum(["current", "review_required"]),
    })
  ),
  adjacent: z.object({ previous: AdjacentSceneSchema.nullable(), next: AdjacentSceneSchema.nullable() }),
  wardrobe_available: z.array(z.object({ id: z.string().uuid(), character_id: z.string().uuid(), name: z.string() })),
  editable: SceneDnaEditableSchema,
});
export type SceneDnaAssemblyInput = z.input<typeof SceneDnaAssemblyInputSchema>;
