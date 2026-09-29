import { z } from "zod";
import { ProjectCreditsSchema } from "./input.schema";
import { AudioFamilySchema, ClipGradeSchema, RenderOptionsSchema, SessionMixSchema, TrackFxSchema } from "@aurastage/contracts";
import { DeliveryProfileSchema } from "../deliveryProfileEngine/output.schema";
import { SubtitleOutputSchema } from "../subtitleTimelineEngine/output.schema";

export const PictureSegmentSchema = z.object({
  kind: z.enum(["take", "black"]),
  record_in: z.number().int(),
  duration: z.number().int(),
  source_in: z.number().int(),
  take_id: z.string().nullable(),
  storage_key: z.string().nullable(),
  media_type: z.string().nullable(),
  capability: z.string().nullable(),
  grade: ClipGradeSchema.nullable(),
  label: z.string(),
});
export type PictureSegment = z.infer<typeof PictureSegmentSchema>;

export const RenderManifestSchema = z.object({
  schema: z.string(),
  project: z.object({ id: z.string(), title: z.string(), credits: ProjectCreditsSchema.optional() }),
  profile: DeliveryProfileSchema,
  options: RenderOptionsSchema,
  picture_lock: z.object({ id: z.string(), lock_number: z.number().int(), timeline_version_id: z.string() }),
  fps: z.number().int(),
  duration_frames: z.number().int(),
  /** Picture, gap-free: every frame is either an approved take or black. */
  picture: z.array(PictureSegmentSchema),
  audio: z.array(z.object({ record_in: z.number().int(), duration: z.number().int(), source_in: z.number().int(), mix_version_id: z.string(), label: z.string() })),
  mixes: z.record(z.object({
    seconds: z.number(),
    tracks: z.array(z.object({ id: z.string(), family: AudioFamilySchema, gain_db: z.number(), pan: z.number(), mute: z.boolean(), solo: z.boolean(), fx: TrackFxSchema })),
    clips: z.array(z.object({ track_id: z.string(), asset_id: z.string(), start_seconds: z.number(), duration_seconds: z.number(), offset_seconds: z.number(), gain_db: z.number(), fade_in_seconds: z.number(), fade_out_seconds: z.number() })),
    /** Buses, shared reverb/delay and master as approved (renderManifest ≥ 1.2.0). */
    mix: SessionMixSchema,
  })),
  assets: z.record(z.object({ storage_key: z.string(), media_type: z.string().nullable() })),
  subtitles: SubtitleOutputSchema.nullable(),
  edl: z.string().nullable(),
  /** Files this render must produce (QC checks the package against this list). */
  files: z.array(z.string()),
  sources: z.object({ take_ids: z.array(z.string()), audio_session_version_ids: z.array(z.string()), asset_ids: z.array(z.string()), dialogue_line_ids: z.array(z.string()) }),
  engine_versions: z.record(z.string()),
});
export type RenderManifest = z.infer<typeof RenderManifestSchema>;
export const RenderManifestOutputSchema = z.object({ manifest: RenderManifestSchema.nullable(), missing: z.array(z.string()), engine_version: z.string() });
export type RenderManifestOutput = z.infer<typeof RenderManifestOutputSchema>;
