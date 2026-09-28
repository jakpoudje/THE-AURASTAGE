import { z } from "zod";

const n = z.number().int().min(0);
export const OverviewFactsSchema = z.object({
  script: z.object({ has_draft: z.boolean(), approved_version: z.number().int().nullable(), scenes: n }),
  casting: z.object({ characters: n, approved: n, pending_candidates: n, sync: z.enum(["no_script", "never", "current", "stale"]) }),
  dialogue: z.object({ scenes_with_lines: n, scenes_approved: n, lines: n, review_required: n, sync: z.enum(["no_script", "never", "current", "stale"]) }),
  scene_dna: z.object({ scenes: n, locked: n, needs_review: n }),
  storyboard: z.object({ locked_scenes: n, planned: n, approved: n, shots: n, needs_review: n }),
  visual: z.object({ shots: n, with_approved_take: n, needs_review: n, running: n }),
  audio: z.object({ scenes: n, approved: n, needs_review: n }),
  editorial: z.object({ timeline: z.boolean(), locked: z.boolean(), lock_number: z.number().int().nullable(), review_required: z.boolean(), offline: n, issues: n }),
  delivery: z.object({ picture_lock: z.boolean(), required: n, required_done: n, delivered: n, failed: n, out_of_date: n }),
});
export type OverviewFacts = z.infer<typeof OverviewFactsSchema>;

export const ProductionOverviewInputSchema = z.object({ project_id: z.string().uuid(), facts: OverviewFactsSchema });
export type ProductionOverviewInput = z.infer<typeof ProductionOverviewInputSchema>;
