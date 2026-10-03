import { z } from "zod";
import { ProjectCreditsSchema } from "./input.schema";
import { AudioFamilySchema, ClipGradeSchema, ClipTransitionSchema, RenderOptionsSchema, SessionMixSchema, TimelineAutomationSchema, TrackFxSchema } from "@aurastage/contracts";
import { DeliveryProfileSchema } from "../deliveryProfileEngine/output.schema";
import { SubtitleOutputSchema } from "../subtitleTimelineEngine/output.schema";

export const PictureSegmentSchema = z.object({
  kind: z.enum(["take", "black", "title", "credits"]),
  record_in: z.number().int(),
  duration: z.number().int(),
  source_in: z.number().int(),
  take_id: z.string().nullable(),
  storage_key: z.string().nullable(),
  media_type: z.string().nullable(),
  capability: z.string().nullable(),
  grade: ClipGradeSchema.nullable(),
  label: z.string(),
  /** Title card / credit roll artwork (SVG); the roll scrolls an image this tall through the frame. */
  svg: z.string().optional(),
  image_height: z.number().int().optional(),
  /** How a take starts/ends (manifest ≥ 1.6.0): dissolve from the picture before, fade from/to black; timing unchanged. */
  transition: ClipTransitionSchema.optional(),
  /**
   * Lip sync on a sketch take (manifest ≥ 1.10.0): mouth changes in frames from the segment's start — from that frame
   * on, the character (`key`, their id in the sketch) shows `viseme`. Taken from the voice clips in the scene mix.
   */
  lipsync: z.array(z.object({ frame: z.number().int().min(0), key: z.string(), viseme: z.enum(["rest", "a", "e", "o", "closed", "fv", "l"]) })).optional(),
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
  /** Music across scenes (A2, manifest ≥ 1.7.0): Assets Library files at their own level, under the scene mixes. */
  music: z.array(z.object({ record_in: z.number().int(), duration: z.number().int(), source_in: z.number().int(), asset_id: z.string(), gain_db: z.number(), label: z.string() })).default([]),
  mixes: z.record(z.object({
    seconds: z.number(),
    tracks: z.array(z.object({ id: z.string(), family: AudioFamilySchema, gain_db: z.number(), pan: z.number(), mute: z.boolean(), solo: z.boolean(), fx: TrackFxSchema })),
    clips: z.array(z.object({ track_id: z.string(), asset_id: z.string(), start_seconds: z.number(), duration_seconds: z.number(), offset_seconds: z.number(), gain_db: z.number(), fade_in_seconds: z.number(), fade_out_seconds: z.number() })),
    /** Buses, shared reverb/delay and master as approved (renderManifest ≥ 1.2.0). */
    mix: SessionMixSchema,
  })),
  assets: z.record(z.object({ storage_key: z.string(), media_type: z.string().nullable() })),
  /** Timeline volume automation applied to the whole cut's sound (renderManifest ≥ 1.3.0). */
  automation: TimelineAutomationSchema,
  subtitles: SubtitleOutputSchema.nullable(),
  edl: z.string().nullable(),
  /** Files this render must produce (QC checks the package against this list). */
  files: z.array(z.string()),
  sources: z.object({ take_ids: z.array(z.string()), audio_session_version_ids: z.array(z.string()), asset_ids: z.array(z.string()), dialogue_line_ids: z.array(z.string()),
    automation_revision: z.string().nullable().default(null),
    /** Scenes whose Scene DNA on-screen text is burned in (manifest ≥ 1.5.0). */
    scene_captions: z.array(z.string()).optional() }),
  engine_versions: z.record(z.string()),
  /** On-screen text burned into video deliverables: from Scene DNA, over the start of each scene (manifest ≥ 1.5.0). */
  overlays: z.array(z.object({ record_in: z.number().int(), duration: z.number().int(), text: z.string(), position: z.enum(["lower_third", "top", "center"]), scene_id: z.string().nullable() })).default([]),
  /** Main theme under the title card and the credit roll (manifest ≥ 1.4.0); the worker synthesises it. */
  title_music: z.object({ description: z.string(), mood: z.array(z.string()), seed: z.number().int() }).nullable().default(null),
});
export type RenderManifest = z.infer<typeof RenderManifestSchema>;
export const RenderManifestOutputSchema = z.object({ manifest: RenderManifestSchema.nullable(), missing: z.array(z.string()), engine_version: z.string() });
export type RenderManifestOutput = z.infer<typeof RenderManifestOutputSchema>;
