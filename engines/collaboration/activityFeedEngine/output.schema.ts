import { z } from "zod";
import { ActivityItemSchema } from "@aurastage/contracts";

export const ActivityFeedOutputSchema = z.object({ items: z.array(ActivityItemSchema), engine_version: z.string() });
export type ActivityFeedOutput = z.infer<typeof ActivityFeedOutputSchema>;
