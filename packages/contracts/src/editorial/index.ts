import { z } from "zod";

// Canonical owner: Editorial & Timeline (SRS §12). The timeline references
// approved Takes (Visual Generation) and approved audio session versions
// (Audio Studio) by id; it never copies or edits their media.

/** Project timebase. All timeline positions and lengths are whole frames. */
export const TIMELINE_FPS = 24;

/** V1 = picture, A1 = scene mixes (approved Audio Studio versions). */
export const TimelineTrackSchema = z.enum(["V1", "A1"]);
export type TimelineTrack = z.infer<typeof TimelineTrackSchema>;

/** take = an approved generated take; slug = offline placeholder (no media yet); audio_mix = an approved scene mix. */
export const TimelineClipKindSchema = z.enum(["take", "slug", "audio_mix"]);
export type TimelineClipKind = z.infer<typeof TimelineClipKindSchema>;

export const ClipGradeSchema = z
  .object({
    exposure: z.number().min(-2).max(2),
    contrast: z.number().min(-1).max(1),
    saturation: z.number().min(-1).max(1),
    temperature: z.number().min(-1).max(1),
  })
  .strict();
export type ClipGrade = z.infer<typeof ClipGradeSchema>;
export const NEUTRAL_GRADE: ClipGrade = { exposure: 0, contrast: 0, saturation: 0, temperature: 0 };

const frame = z.number().int().min(0).max(24 * 60 * 60 * 6);
export const TimelineClipSchema = z.object({
  id: z.string().uuid(),
  track: TimelineTrackSchema,
  kind: TimelineClipKindSchema,
  /** Position on the timeline (frames). */
  record_in: frame,
  duration: frame.min(1),
  /** Offset into the source media (frames). */
  source_in: frame,
  /** Length of the source media in frames; null = a still image (any length). */
  source_frames: frame.nullable(),
  scene_id: z.string().uuid().nullable(),
  shot_id: z.string().uuid().nullable(),
  take_id: z.string().uuid().nullable(),
  audio_session_version_id: z.string().uuid().nullable(),
  label: z.string().min(1).max(200),
  grade: ClipGradeSchema,
});
export type TimelineClip = z.infer<typeof TimelineClipSchema>;

const delta = z.number().int().min(-24 * 60 * 60).max(24 * 60 * 60);
const clipId = z.string().uuid();
const at = frame;
/** What to put on the timeline. The server resolves it to the CURRENTLY approved take / scene mix. */
export const EditSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shot"), shot_id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("scene_mix"), scene_id: z.string().uuid() }).strict(),
]);
export type EditSource = z.infer<typeof EditSourceSchema>;

/** NLE operations (SRS §12). Semantics live in engines/editorial/editDecisionEngine. */
export const EditOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("insert"), at, source: EditSourceSchema, duration: frame.min(1).optional() }).strict(),
  z.object({ op: z.literal("overwrite"), at, source: EditSourceSchema, duration: frame.min(1).optional() }).strict(),
  z.object({ op: z.literal("trim"), clip_id: clipId, edge: z.enum(["in", "out"]), delta, ripple: z.boolean() }).strict(),
  z.object({ op: z.literal("roll"), clip_id: clipId, delta }).strict(),
  z.object({ op: z.literal("slip"), clip_id: clipId, delta }).strict(),
  z.object({ op: z.literal("slide"), clip_id: clipId, delta }).strict(),
  z.object({ op: z.literal("blade"), track: TimelineTrackSchema, at }).strict(),
  z.object({ op: z.literal("lift"), clip_id: clipId }).strict(),
  z.object({ op: z.literal("extract"), clip_id: clipId }).strict(),
  z.object({ op: z.literal("move"), clip_id: clipId, record_in: at }).strict(),
  z.object({ op: z.literal("grade"), clip_id: clipId, grade: ClipGradeSchema }).strict(),
  /** Swap every clip's source for the currently approved take / scene mix, keeping the cut. */
  z.object({ op: z.literal("conform") }).strict(),
]);
export type EditOperation = z.infer<typeof EditOperationSchema>;

export const EditRequestSchema = z
  .object({
    /** The timeline revision the edit was made against (optimistic concurrency). */
    base_revision: z.string().uuid(),
    operation: EditOperationSchema,
    /** Required to edit a picture-locked timeline; the break is recorded with its impact. */
    break_lock: z.boolean().optional(),
  })
  .strict();
export type EditRequest = z.infer<typeof EditRequestSchema>;

export const AssembleRequestSchema = z.object({ base_revision: z.string().uuid().nullable(), break_lock: z.boolean().optional() }).strict();
export const SaveTimelineVersionSchema = z.object({ label: z.string().trim().min(1).max(120) }).strict();
export const RestoreTimelineVersionSchema = z.object({ base_revision: z.string().uuid(), break_lock: z.boolean().optional() }).strict();
export const PictureLockRequestSchema = z.object({ base_revision: z.string().uuid() }).strict();

/** One automation point on the timeline: a level (dB, relative to the scene mixes) at a frame (migration 0032). */
export const AutomationPointSchema = z.object({ frame: z.number().int().min(0), db: z.number().min(-60).max(12) }).strict();
export type AutomationPoint = z.infer<typeof AutomationPointSchema>;
/** Volume automation of the cut's sound (A1). Points are in frame order, one per frame; straight lines in dB between. */
export const TimelineAutomationSchema = z.object({ A1: z.array(AutomationPointSchema).max(2000).default([]) }).strict();
export type TimelineAutomation = z.infer<typeof TimelineAutomationSchema>;
export const SaveTimelineAutomationSchema = z.object({ automation: TimelineAutomationSchema, base_revision: z.string().uuid() }).strict();
export type SaveTimelineAutomationInput = z.infer<typeof SaveTimelineAutomationSchema>;

/** Where picture changes after a Picture Lock land (SRS §12 impact analysis). */
export const PictureImpactSchema = z.object({
  scene_id: z.string().uuid().nullable(),
  label: z.string(),
  change: z.enum(["retimed", "moved", "added", "removed", "recut"]),
  evidence: z.string(),
  affects: z.array(z.string()),
});
export type PictureImpact = z.infer<typeof PictureImpactSchema>;
