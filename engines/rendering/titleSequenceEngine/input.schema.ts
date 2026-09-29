import { z } from "zod";

const name = z.string().trim().max(200);
export const TitleSequenceInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  width: z.number().int().min(160).max(8192),
  height: z.number().int().min(90).max(8192),
  fps: z.number().positive().max(120),
  opening: z.object({ enabled: z.boolean(), seconds: z.number().min(2).max(15).default(5), subtitle: name.nullable().default(null) }),
  end_credits: z.object({ enabled: z.boolean(), speed: z.enum(["slow", "medium", "fast"]).default("medium") }),
  /** Project Settings production credits (only the ones that are set are shown). */
  credits: z.object({
    director: name.nullable().optional(), writer: name.nullable().optional(), producer: name.nullable().optional(), composer: name.nullable().optional(),
    company: name.nullable().optional(), country: name.nullable().optional(), year: z.number().int().nullable().optional(), copyright: name.nullable().optional(),
    thanks: z.string().max(1000).nullable().optional(),
  }).default({}),
  /** Characters in order of importance; a performer's name when there is one (e.g. a voice actor). */
  cast: z.array(z.object({ character: name.min(1), performer: name.nullable().default(null) })).max(200).default([]),
  /** Where sound and pictures came from (e.g. "AuraStage neural voice"), credited honestly. */
  made_with: z.array(name).max(20).default([]),
});
export type TitleSequenceInput = z.input<typeof TitleSequenceInputSchema>;
