import { z } from "zod";

export const ActivityEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  object_type: z.string(),
  object_id: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()).nullable().default({}),
  actor_email: z.string().nullable(),
  created_at: z.string(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const ActivityFeedInputSchema = z.object({ events: z.array(ActivityEventSchema) });
export type ActivityFeedInput = z.infer<typeof ActivityFeedInputSchema>;
