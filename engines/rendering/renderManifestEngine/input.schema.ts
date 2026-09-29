import { z } from "zod";
import { RenderOptionsSchema, SessionMixSchema, TimelineAutomationSchema, TimelineClipSchema } from "@aurastage/contracts";
import { DeliveryProfileSchema } from "../deliveryProfileEngine/output.schema";

const num = z.coerce.number();
/** Project Settings credits written into rendered files' metadata (renderManifest ≥ 1.1.0). */
export const ProjectCreditsSchema = z.object({
  director: z.string().nullable(), producer: z.string().nullable(), company: z.string().nullable(),
  copyright: z.string().nullable(), year: z.number().int().nullable(),
}).partial();
export const RenderManifestInputSchema = z.object({
  project: z.object({ id: z.string(), title: z.string(), credits: ProjectCreditsSchema.optional() }),
  profile: DeliveryProfileSchema,
  options: RenderOptionsSchema,
  picture_lock: z.object({ id: z.string(), lock_number: z.number().int(), timeline_version_id: z.string() }),
  fps: z.number().int().min(1).max(120),
  /** Clips of the Picture Lock version (never the live timeline). */
  clips: z.array(TimelineClipSchema),
  takes: z.record(z.object({ storage_key: z.string().nullable(), media_type: z.string().nullable(), capability: z.string(), duration_seconds: z.number().nullable() })),
  mixes: z.record(
    z.object({
      scene_id: z.string().nullable(),
      version_number: z.number().int(),
      seconds: z.number().positive(),
      tracks: z.array(z.object({ id: z.string(), family: z.string(), gain_db: num, pan: num, mute: z.boolean(), solo: z.boolean() }).passthrough()),
      clips: z.array(
        z.object({
          track_id: z.string(), kind: z.string(), asset_id: z.string().nullable(), start_seconds: num, duration_seconds: num, offset_seconds: num,
          gain_db: num, fade_in_seconds: num, fade_out_seconds: num, source: z.record(z.unknown()).nullable().optional(),
        }).passthrough()
      ),
      /** Session routing approved with the mix (migration 0029); older versions read as neutral. */
      mix: SessionMixSchema.nullable().optional(),
    })
  ),
  assets: z.record(z.object({ storage_key: z.string().nullable(), media_type: z.string().nullable() })),
  /** Volume automation of the cut's sound and the revision it was read at (migration 0032). */
  automation: TimelineAutomationSchema.default({}),
  automation_revision: z.string().nullable().default(null),
  lines: z.record(z.object({ speaker: z.string(), text: z.string() })),
  /** Opening title card and end-credits roll (titleSequenceEngine), added to video deliverables only (manifest ≥ 1.4.0). */
  titles: z.object({
    opening: z.object({ frames: z.number().int().positive(), svg: z.string().max(200_000) }).nullable(),
    end_credits: z.object({ frames: z.number().int().positive(), svg: z.string().max(2_000_000), image_height: z.number().int().positive() }).nullable(),
    engine_version: z.string(),
  }).nullable().default(null),
  /** The built-in main theme under the titles (proceduralAudioEngine "theme" score), when Project Settings asks for it. */
  title_music: z.object({ description: z.string().max(300), mood: z.array(z.string().max(40)).max(8), seed: z.number().int().min(0) }).nullable().default(null),
});
export type RenderManifestInput = z.infer<typeof RenderManifestInputSchema>;
