import { z } from "zod";

export const QCCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  /** Blocking checks must pass before Picture Lock. */
  blocking: z.boolean(),
  evidence: z.string(),
  /** Exact places on the timeline (SRS §12: issues link back to exact timecode). */
  at: z.array(z.object({ clip_id: z.string().nullable(), frame: z.number().int(), timecode: z.string(), note: z.string() })),
});
export type QCCheck = z.infer<typeof QCCheckSchema>;
export const EditorialQCOutputSchema = z.object({
  checks: z.array(QCCheckSchema),
  ready_for_lock: z.boolean(),
  duration_frames: z.number().int(),
  engine_version: z.string(),
});
export type EditorialQCOutput = z.infer<typeof EditorialQCOutputSchema>;
