import { z } from "zod";
import { ReadinessPredicateSchema } from "@aurastage/contracts";

const Evidence = z.object({ value: z.string(), line: z.number().int(), text: z.string() });

export const SceneDnaProposalSchema = z.object({
  narrative: z.object({ intended_duration_seconds: z.number().nonnegative() }),
  participants: z.array(
    z.object({
      character_id: z.string().uuid(),
      name: z.string(),
      presence: z.enum(["on_screen", "voice_only"]),
      speaking: z.boolean(),
      line_count: z.number().int(),
      wardrobe_look_id: z.string().uuid().nullable(),
      wardrobe_look_name: z.string().nullable(),
    })
  ),
  dialogue: z.object({
    line_ids: z.array(z.string().uuid()),
    total: z.number().int(),
    approved: z.number().int(),
    needs_review: z.number().int(),
    emotions: z.array(z.object({ emotion: z.string(), count: z.number().int() })),
    peak_intensity: z.number().int().nullable(),
    silent: z.boolean(),
  }),
  location: z.object({ name: z.string(), int_ext: z.string(), time_of_day: z.string().nullable() }),
  environment: z.object({ weather: z.array(Evidence), atmosphere: z.array(Evidence) }),
  sound_candidates: z.array(z.object({ cue: z.string(), line: z.number().int(), text: z.string() })),
  continuity: z.object({
    previous: z.object({ number: z.number().int(), heading: z.string() }).nullable(),
    next: z.object({ number: z.number().int(), heading: z.string() }).nullable(),
    notes: z.array(z.string()),
  }),
  readiness: z.array(ReadinessPredicateSchema),
  /** All blocking predicates pass (SRS §14.1 ShotPlanningReady needs this plus approval). */
  ready_for_approval: z.boolean(),
});
export type SceneDnaProposal = z.infer<typeof SceneDnaProposalSchema>;

export const SceneDnaAssemblyOutputSchema = z.object({ proposal: SceneDnaProposalSchema, engine_version: z.string() });
export type SceneDnaAssemblyOutput = z.infer<typeof SceneDnaAssemblyOutputSchema>;
