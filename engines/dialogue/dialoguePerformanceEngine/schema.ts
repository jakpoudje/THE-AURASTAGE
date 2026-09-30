import { z } from "zod";
import { DialogueEmotionSchema } from "@aurastage/contracts";

export const PerformanceLineSchema = z.object({
  id: z.string(),
  speaker: z.string().max(120),
  character_id: z.string().nullable().default(null),
  text: z.string().max(4000),
  parenthetical: z.string().max(400).nullable().default(null),
});
export const DialoguePerformanceInputSchema = z.object({
  /** The scene's mood words (Scene DNA), used when a line itself carries no strong signal. */
  scene: z.object({ heading: z.string().max(300).default(""), mood: z.array(z.string().max(40)).max(8).default([]) }).default({}),
  lines: z.array(PerformanceLineSchema).max(2000),
});
export type DialoguePerformanceInput = z.input<typeof DialoguePerformanceInputSchema>;

export const LineReadSchema = z.object({
  id: z.string(),
  emotion: DialogueEmotionSchema,
  intensity: z.number().int().min(0).max(10),
  intention: z.string().max(200),
  subtext: z.string().max(2000),
  /** How to say it (pace, volume, pauses) — goes into the line's notes when they are empty. */
  delivery: z.string().max(400),
  /** The words or signs the read came from, so a person can check it. */
  evidence: z.string().max(300),
});
export type LineRead = z.infer<typeof LineReadSchema>;
export const DialoguePerformanceOutputSchema = z.object({ lines: z.array(LineReadSchema), engine_version: z.string() });
export type DialoguePerformanceOutput = z.infer<typeof DialoguePerformanceOutputSchema>;
