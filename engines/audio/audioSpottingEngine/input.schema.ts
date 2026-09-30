import { z } from "zod";

export const AudioSpottingInputSchema = z.object({
  scene: z.object({ number: z.number().int(), heading: z.string(), int_ext: z.string(), location: z.string(), time_of_day: z.string().nullable() }),
  /** Story time of the approved shot plan (seconds). */
  scene_seconds: z.number().positive(),
  /** Shots of the approved shot plan version (story-time intervals + which lines they cover). */
  shots: z.array(z.object({ ordinal: z.number().int(), story_start: z.number(), story_end: z.number(), dialogue_line_ids: z.array(z.string()) })),
  /** Dialogue lines of the locked Scene DNA, in script order. */
  lines: z.array(
    z.object({
      id: z.string(),
      speaker: z.string(),
      character_id: z.string().nullable(),
      character_name: z.string().nullable(),
      text: z.string(),
      estimated_seconds: z.number().nonnegative(),
      voice_over: z.boolean().default(false),
      /** The line's position in the approved script (source line number), so sound cues can be placed around it. */
      script_line: z.number().int().positive().nullable().optional(),
    })
  ),
  /** The scene's first and last source lines in the approved script (for placing cues before/after the dialogue). */
  script_lines: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }).nullable().optional(),
  /** Sound notes from the locked Scene DNA version. */
  dna: z.object({
    sound_intent: z.string().nullable(),
    weather: z.string().nullable(),
    atmosphere: z.string().nullable(),
    mood: z.array(z.string()),
    sound_candidates: z.array(z.object({ cue: z.string(), line: z.number().int(), text: z.string() })),
  }),
  /** The scene's music suggestion (musicSuggestionEngine, 1.2.0+): it names the score cue so "Generate" plays the suggested
   * style, and a scene better without score gets none. Absent: the score cue comes from Scene DNA mood / sound intent. */
  music: z.object({ needed: z.boolean(), description: z.string().max(400), why: z.array(z.string().max(300)).max(10).default([]) }).nullable().optional(),
});
export type AudioSpottingInput = z.input<typeof AudioSpottingInputSchema>;
