import { z } from "zod";

// Canonical owner: Export & Deliver (SRS §12 RenderManifest / Deliverable).
// A render is made ONLY from a Picture Lock. Its RenderManifest is immutable and
// records the exact picture lock, timeline, source takes, mixes, recordings,
// subtitle cues and delivery profile version it was made from.

export const DeliveryProfileIdSchema = z.enum([
  "streaming_master",
  "review_copy",
  "mezzanine_master",
  "audio_package",
  "subtitles",
  "edit_decision_list",
  // Cut from the Picture Lock by cutdownEngine (BUILD_PLAN §8 item 13).
  "social_vertical",
  "trailer",
]);
export type DeliveryProfileId = z.infer<typeof DeliveryProfileIdSchema>;

export const RenderOptionsSchema = z
  .object({
    /** Burned into review copies only. */
    watermark: z.string().trim().max(60).nullable(),
    /** Burn the running timecode into the picture (review copies only). */
    burn_timecode: z.boolean(),
    /** Social cut-downs and trailers: how long (seconds). */
    length_seconds: z.number().int().min(6).max(300).nullable().optional(),
  })
  .strict();
export type RenderOptions = z.infer<typeof RenderOptionsSchema>;

export const CreateRenderInputSchema = z
  .object({
    profile_id: DeliveryProfileIdSchema,
    options: RenderOptionsSchema.partial().optional(),
  })
  .strict();
export type CreateRenderInput = z.infer<typeof CreateRenderInputSchema>;

export const RenderStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

/** One file of a deliverable, with its checksum (SRS §12 package integrity). */
export const RenderOutputSchema = z.object({
  name: z.string().min(1).max(200),
  storage_key: z.string().min(1),
  media_type: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RenderOutput = z.infer<typeof RenderOutputSchema>;

export const DeliveryQCCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  blocking: z.boolean(),
  evidence: z.string(),
  file: z.string().nullable(),
});
export type DeliveryQCCheck = z.infer<typeof DeliveryQCCheckSchema>;
