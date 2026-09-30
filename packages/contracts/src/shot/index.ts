import { z } from "zod";

// Canonical owner: Storyboard & Shots (docs/architecture/DATA_AUTHORITY.md, SRS §9).
// Shot DNA translates a LOCKED Scene DNA version into cinematography. It never
// rewrites the scene: dialogue/characters are referenced by canonical id.

export const ShotSizeSchema = z.enum([
  "EWS", "WS", "FULL", "MWS", "COWBOY", "MS", "MCU", "CU", "ECU",
  "TWO_SHOT", "THREE_SHOT", "GROUP", "OTS", "POV", "INSERT", "CUTAWAY",
]);
export type ShotSize = z.infer<typeof ShotSizeSchema>;

export const ShotAngleSchema = z.enum(["eye", "high", "low", "dutch", "overhead", "birds_eye", "worms_eye", "ground", "hip", "shoulder", "aerial"]);
export type ShotAngle = z.infer<typeof ShotAngleSchema>;

export const ShotMovementSchema = z.enum([
  "static", "pan", "tilt", "push_in", "pull_out", "dolly", "truck", "pedestal", "tracking",
  "arc", "crane", "gimbal", "steadicam", "handheld", "drone", "zoom", "dolly_zoom", "whip_pan",
]);
export type ShotMovement = z.infer<typeof ShotMovementSchema>;

export const ShotSupportSchema = z.enum(["tripod", "shoulder", "handheld", "gimbal", "steadicam", "dolly", "crane", "vehicle", "drone", "virtual"]);
export const ShotFocusSchema = z.enum(["deep", "shallow", "focus_pull", "rack_focus", "subject_tracking"]);

/** What the shot is for (drives coverage: dialogue/action beats are mandatory). */
/**
 * Coverage styles for the one-click shot list (shotPlanningEngine 1.1.0):
 * standard — establishing, master, singles by intensity, reactions after strong lines;
 * simple — fewer set-ups: no reactions, singles stay medium and still;
 * intimate — one size closer, shallow focus, reactions from intensity 5;
 * energetic — a moving camera on every shot, push-ins from intensity 5, reactions from intensity 6.
 */
export const CoverageStyleSchema = z.enum(["standard", "simple", "intimate", "energetic"]);
export type CoverageStyle = z.infer<typeof CoverageStyleSchema>;

export const ShotPurposeSchema = z.enum(["establishing", "master", "dialogue", "reaction", "action", "insert", "transition"]);
export type ShotPurpose = z.infer<typeof ShotPurposeSchema>;

export const ShotTransitionSchema = z.enum(["cut", "match_cut", "dissolve", "fade", "smash_cut", "j_cut", "l_cut"]);

/** Fields a person edits on a shot. */
export const ShotEditableSchema = z.object({
  purpose: ShotPurposeSchema,
  size: ShotSizeSchema,
  angle: ShotAngleSchema.default("eye"),
  movement: ShotMovementSchema.default("static"),
  support: ShotSupportSchema.default("tripod"),
  focus: ShotFocusSchema.default("deep"),
  lens_mm: z.number().int().min(8).max(600).nullable().default(null),
  duration_seconds: z.number().positive().max(600),
  description: z.string().trim().min(1).max(500),
  composition: z.string().max(500).nullable().default(null),
  lighting: z.string().max(500).nullable().default(null),
  transition_in: ShotTransitionSchema.default("cut"),
  notes: z.string().max(2000).nullable().default(null),
  /** Canonical Casting character ids in frame. */
  character_ids: z.array(z.string().uuid()).max(20).default([]),
  /** Canonical Dialogue line ids this shot covers. */
  dialogue_line_ids: z.array(z.string().uuid()).max(50).default([]),
  /** Story-time interval inside the scene this shot covers (for coverage C). */
  story_start: z.number().nonnegative(),
  story_end: z.number().nonnegative(),
});
export type ShotEditable = z.infer<typeof ShotEditableSchema>;

export const CreateShotInputSchema = ShotEditableSchema.refine((s) => s.story_end >= s.story_start, {
  message: "A shot can't end before it starts",
  path: ["story_end"],
});
export const UpdateShotInputSchema = ShotEditableSchema.partial();
export type UpdateShotInput = z.infer<typeof UpdateShotInputSchema>;

export const ShotSchema = ShotEditableSchema.extend({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  scene_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  ordinal: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Shot = z.infer<typeof ShotSchema>;

export const ShotPlanStatusSchema = z.enum(["draft", "approved"]);
export const ShotPlanReviewStateSchema = z.enum(["current", "review_required", "stale"]);

export const ShotPlanSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  scene_id: z.string().uuid(),
  /** The locked Scene DNA version this plan was derived from (CLAUDE.md rule 10). */
  scene_dna_version_id: z.string().uuid(),
  status: ShotPlanStatusSchema,
  review_state: ShotPlanReviewStateSchema,
  review_reason: z.string().nullable(),
  approved_version_id: z.string().uuid().nullable(),
  approved_version_number: z.number().int().nullable(),
  engine_version: z.string().nullable(),
  updated_at: z.string(),
});
export type ShotPlan = z.infer<typeof ShotPlanSchema>;
