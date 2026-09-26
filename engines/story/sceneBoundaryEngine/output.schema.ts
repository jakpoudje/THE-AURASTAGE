import { z } from "zod";
import { IntExtSchema } from "@aurastage/contracts";

export const SceneCandidateSchema = z.object({
  number: z.number().int().positive(),
  heading: z.string(),
  int_ext: IntExtSchema,
  location: z.string(),
  time_of_day: z.string().nullable(),
  speaking_characters: z.array(z.string()),
  estimated_seconds: z.number().int().nonnegative(),
  element_start: z.number().int().nonnegative(),
  element_end: z.number().int().nonnegative(),
  heading_line: z.number().int().positive(),
});
export type SceneCandidate = z.infer<typeof SceneCandidateSchema>;

export const ScriptAnalysisSchema = z.object({
  estimated_pages: z.number(),
  estimated_minutes: z.number(),
  scene_count: z.number().int(),
  speaking_characters: z.array(z.object({ name: z.string(), lines: z.number().int(), scenes: z.number().int() })),
  locations: z.array(z.object({ name: z.string(), scenes: z.number().int() })),
});
export type ScriptAnalysis = z.infer<typeof ScriptAnalysisSchema>;

export const SceneBoundaryOutputSchema = z.object({
  scenes: z.array(SceneCandidateSchema),
  analysis: ScriptAnalysisSchema,
  engine_version: z.string(),
});
export type SceneBoundaryOutput = z.infer<typeof SceneBoundaryOutputSchema>;
