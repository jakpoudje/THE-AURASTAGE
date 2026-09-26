import { z } from "zod";

// Canonical owner: Project Settings + Scriptwriter-owned story fields
// (see docs/architecture/DATA_AUTHORITY.md). Story fields (title, genre,
// subgenre, setting, time_period, logline, target_runtime_minutes) are
// edited in Scriptwriter; Project Settings displays them read-only.

export const ProjectTypeSchema = z.enum([
  "feature_film",
  "short_film",
  "series",
  "documentary",
  "animation",
]);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

export const ProjectStatusSchema = z.enum([
  "draft",
  "in_production",
  "completed",
  "archived",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  title: z.string().min(1),
  type: ProjectTypeSchema,
  genre: z.string().nullable().optional(),
  subgenre: z.string().nullable().optional(),
  setting: z.string().nullable().optional(),
  time_period: z.string().nullable().optional(),
  logline: z.string().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  tone: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  opening_style: z.string().nullable().optional(),
  ending_style: z.string().nullable().optional(),
  target_runtime_minutes: z.number().int().positive().nullable().optional(),
  status: ProjectStatusSchema,
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

// Scriptwriter "Project Setup" step (SRS §5) — this is what the Generate
// Story Outline action submits. Kept here (not duplicated in the
// scriptwriter contract) because it maps 1:1 onto the canonical Project row.
export const CreateProjectInputSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  type: ProjectTypeSchema.default("feature_film"),
  genre: z.string().max(100).optional(),
  subgenre: z.string().max(100).optional(),
  setting: z.string().max(200).optional(),
  time_period: z.string().max(100).optional(),
  /** One or two sentences. Longer story text belongs in `synopsis`. */
  logline: z.string().max(500, "Logline must be 500 characters or fewer — put longer story text in the synopsis").optional(),
  /** Long-form story outline (acts, beats). Feeds Story Development. */
  synopsis: z.string().max(20000, "Synopsis must be 20,000 characters or fewer").optional(),
  tone: z.string().max(100).optional(),
  audience: z.string().max(100).optional(),
  opening_style: z.string().max(100).optional(),
  ending_style: z.string().max(100).optional(),
  target_runtime_minutes: z.number().int().min(1).max(600).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = CreateProjectInputSchema.partial().omit({
  org_id: true,
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;
