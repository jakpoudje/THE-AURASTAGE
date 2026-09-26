import { z } from "zod";

// Canonical owner: Scriptwriter (see docs/architecture/DATA_AUTHORITY.md).
// SRS §5: a screenplay is stored as typed elements, not one text blob.

export const ScreenplayElementTypeSchema = z.enum([
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "centered",
  "section",
  "note",
]);
export type ScreenplayElementType = z.infer<typeof ScreenplayElementTypeSchema>;

export const ScreenplayElementSchema = z.object({
  /** Position within this script version; stable for the life of the version. */
  index: z.number().int().nonnegative(),
  type: ScreenplayElementTypeSchema,
  text: z.string(),
  /** 1-based line in the source text where the element starts (evidence link). */
  line: z.number().int().positive(),
  /** For character cues: the normalised speaker name (extensions like (V.O.) removed). */
  speaker: z.string().optional(),
  /** For character cues: extensions such as V.O., O.S., CONT'D. */
  extensions: z.array(z.string()).optional(),
});
export type ScreenplayElement = z.infer<typeof ScreenplayElementSchema>;

export const ScriptStatusSchema = z.enum(["draft", "approved"]);
export type ScriptStatus = z.infer<typeof ScriptStatusSchema>;

export const ScriptSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  status: ScriptStatusSchema,
  current_version_id: z.string().uuid().nullable(),
  approved_version_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Script = z.infer<typeof ScriptSchema>;

export const ScriptVersionSchema = z.object({
  id: z.string().uuid(),
  script_id: z.string().uuid(),
  org_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  source_text: z.string(),
  elements: z.array(ScreenplayElementSchema),
  parser_version: z.string(),
  note: z.string().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
});
export type ScriptVersion = z.infer<typeof ScriptVersionSchema>;

export const IntExtSchema = z.enum(["INT", "EXT", "INT/EXT", "UNKNOWN"]);
export type IntExt = z.infer<typeof IntExtSchema>;

export const SceneStatusSchema = z.enum(["active", "omitted"]);

export const SceneSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  script_id: z.string().uuid(),
  number: z.number().int().positive(),
  heading: z.string(),
  int_ext: IntExtSchema,
  location: z.string(),
  time_of_day: z.string().nullable(),
  speaking_characters: z.array(z.string()),
  estimated_seconds: z.number().int().nonnegative(),
  element_start: z.number().int().nonnegative(),
  element_end: z.number().int().nonnegative(),
  source_version_id: z.string().uuid(),
  status: SceneStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const SaveScriptVersionInputSchema = z.object({
  source_text: z.string().max(2_000_000),
  /** Optimistic concurrency: the version the editor started from (null for the first save). */
  base_version_id: z.string().uuid().nullable(),
  note: z.string().max(500).optional(),
});
export type SaveScriptVersionInput = z.infer<typeof SaveScriptVersionInputSchema>;

export const ApproveScriptInputSchema = z.object({
  version_id: z.string().uuid(),
});
export type ApproveScriptInput = z.infer<typeof ApproveScriptInputSchema>;

/** SRS §5.1 runtime-driven scope plan. A planning prior, never a hard rule. */
export const ScopePlanSchema = z.object({
  target_runtime_minutes: z.number().positive(),
  mean_scene_minutes: z.number().positive(),
  estimated_scene_count: z.number().int().positive(),
  estimated_pages: z.object({ min: z.number().int(), max: z.number().int() }),
  acts: z.array(
    z.object({ act: z.number().int().positive(), label: z.string(), minutes: z.number(), scenes: z.number().int() })
  ),
  basis: z.string(),
});
export type ScopePlan = z.infer<typeof ScopePlanSchema>;
