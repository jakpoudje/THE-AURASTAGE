import { z } from "zod";

// Canonical owner: Scene DNA (docs/architecture/DATA_AUTHORITY.md, SRS §8).
// A versioned production blueprint for one scene that references (never
// redefines) upstream authorities: Scriptwriter scenes, Casting characters and
// wardrobe looks, Dialogue lines. Approval freezes the exact upstream versions.

export const CameraEnergySchema = z.enum(["calm", "measured", "dynamic", "frenetic"]);
export type CameraEnergy = z.infer<typeof CameraEnergySchema>;

/** What a person writes/chooses in Scene DNA (everything else is derived from evidence). */
export const SceneDnaEditableSchema = z.object({
  purpose: z.string().max(1000).nullable().default(null),
  stakes: z.string().max(1000).nullable().default(null),
  story_time: z.string().max(200).nullable().default(null),
  mood: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  weather: z.string().max(200).nullable().default(null),
  atmosphere: z.string().max(500).nullable().default(null),
  lighting_intent: z.string().max(1000).nullable().default(null),
  sound_intent: z.string().max(1000).nullable().default(null),
  camera_energy: CameraEnergySchema.nullable().default(null),
  /** Explicit silent-scene state (SRS §8.1 step 4): no dialogue is intended. */
  silent_scene: z.boolean().default(false),
  /** character_id -> wardrobe_look_id chosen for this scene. */
  wardrobe: z.record(z.string().uuid(), z.string().uuid()).default({}),
  /** character_id -> character_age_state_id: the character's age in this scene (flashbacks, time jumps; migration 0035). */
  ages: z.record(z.string().uuid(), z.string().uuid()).default({}),
  notes: z.string().max(4000).nullable().default(null),
  /** On-screen text burned into video deliverables over the start of the scene, e.g. "LAGOS — 1995" (migration 0040). */
  on_screen_text: z.string().trim().max(200).nullable().default(null),
  on_screen_position: z.enum(["lower_third", "top", "center"]).default("lower_third"),
});
export type SceneDnaEditable = z.infer<typeof SceneDnaEditableSchema>;

export const UpdateSceneDnaInputSchema = SceneDnaEditableSchema.partial();
export type UpdateSceneDnaInput = z.infer<typeof UpdateSceneDnaInputSchema>;

export const ReadinessPredicateSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  /** Blocking predicates must pass before approval (SRS §14.1). */
  blocking: z.boolean(),
  evidence: z.string(),
});
export type ReadinessPredicate = z.infer<typeof ReadinessPredicateSchema>;

export const SceneDnaStatusSchema = z.enum(["draft", "approved"]);
export const SceneDnaReviewStateSchema = z.enum(["current", "review_required", "stale"]);

export const SceneDnaDriftSchema = z.object({
  type: z.string(),
  id: z.string(),
  label: z.string(),
  kind: z.enum(["changed", "removed", "added"]),
  effect: z.enum(["stale", "review_required"]),
  message: z.string(),
});
export type SceneDnaDrift = z.infer<typeof SceneDnaDriftSchema>;

export const SceneDnaRecordSchema = SceneDnaEditableSchema.extend({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  scene_id: z.string().uuid(),
  status: SceneDnaStatusSchema,
  review_state: SceneDnaReviewStateSchema,
  approved_version_id: z.string().uuid().nullable(),
  approved_version_number: z.number().int().nullable(),
  drift: z.array(SceneDnaDriftSchema),
  updated_at: z.string(),
});
export type SceneDnaRecord = z.infer<typeof SceneDnaRecordSchema>;
