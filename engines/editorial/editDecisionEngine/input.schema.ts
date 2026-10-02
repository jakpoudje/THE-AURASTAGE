import { z } from "zod";
import { EditOperationSchema } from "@aurastage/contracts";
import { EngineClipSchema } from "../timeline";

export const EditDecisionInputSchema = z.object({
  clips: z.array(EngineClipSchema.extend({ id: z.string().uuid() })),
  operation: EditOperationSchema,
  /** insert/overwrite: the clip to place (already resolved to the approved source by the caller). */
  new_clip: EngineClipSchema.optional(),
  /** conform: the currently approved source for each clip that should change. */
  replacements: z
    .array(
      z.object({
        clip_id: z.string().uuid(),
        kind: z.enum(["take", "slug", "audio_mix"]),
        take_id: z.string().uuid().nullable(),
        audio_session_version_id: z.string().uuid().nullable(),
        source_frames: z.number().int().min(1).nullable(),
        label: z.string().min(1).max(200),
      })
    )
    .optional(),
  /**
   * conform (1.3.0): approved scene mixes that are not on the cut yet, already placed in sync with their scene's
   * picture by the caller. Each is laid in the free space at its position on its own track; nothing moves.
   */
  additions: z.array(EngineClipSchema).optional(),
});
export type EditDecisionInput = z.infer<typeof EditDecisionInputSchema>;
