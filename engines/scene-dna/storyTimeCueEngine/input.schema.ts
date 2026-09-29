import { z } from "zod";

export const StoryTimeCueInputSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    number: z.number().int(),
    heading: z.string().max(400),
    /** The scene's action lines, in order (their script line numbers are the evidence). */
    action: z.array(z.object({ line: z.number().int(), text: z.string().max(4000) })).max(2000).default([]),
  })).max(2000),
  /**
   * Character names to look for ("YOUNG AMARA", "AMARA (10)"), with the profile age: "AMARA (32)" is how a screenplay
   * introduces a character, so an age in brackets is only a clue when it is clearly not the profile age.
   */
  characters: z.array(z.object({ id: z.string(), name: z.string().min(1).max(120), age: z.string().max(40).nullable().optional() })).max(500).default([]),
});
export type StoryTimeCueInput = z.input<typeof StoryTimeCueInputSchema>;
