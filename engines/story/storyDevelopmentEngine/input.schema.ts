import { z } from "zod";

/** The project brief the writer has given so far (canonical Project/story-setup fields, read-only). */
export const StoryBriefSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().default("feature_film"),
  logline: z.string().max(500).nullable().default(null),
  synopsis: z.string().max(20000).nullable().default(null),
  genre: z.string().max(100).nullable().default(null),
  subgenre: z.string().max(100).nullable().default(null),
  tone: z.string().max(100).nullable().default(null),
  setting: z.string().max(200).nullable().default(null),
  time_period: z.string().max(100).nullable().default(null),
  target_runtime_minutes: z.number().int().min(1).max(600).nullable().default(null),
  /** Anything extra the writer asked for ("make the antagonist sympathetic"). */
  request: z.string().max(2000).default(""),
});
export type StoryBrief = z.input<typeof StoryBriefSchema>;
