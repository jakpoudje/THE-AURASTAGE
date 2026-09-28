import { z } from "zod";
/** Only counts and error codes the caller may already see — never script text or media. */
export const ProjectFactsSchema = z.object({
  failed_jobs: z.array(z.object({ engine_id: z.string(), code: z.string().nullable(), at: z.string() })).default([]),
  stuck_jobs: z.array(z.object({ engine_id: z.string(), minutes: z.number() })).default([]),
  review_required: z.record(z.number().int().nonnegative()).default({}),
  script_approved: z.boolean().nullable().default(null),
  picture_locked: z.boolean().nullable().default(null),
});
export type ProjectFacts = z.input<typeof ProjectFactsSchema>;
