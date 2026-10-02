import { z } from "zod";

// Canonical owner: Editorial & Timeline (SRS §12). The timeline references
// approved Takes (Visual Generation) and approved audio session versions
// (Audio Studio) by id; it never copies or edits their media.

/** Project timebase. All timeline positions and lengths are whole frames. */
export const TIMELINE_FPS = 24;

/**
 * V1 = picture, V2 = inserts over the picture (an approved take shown instead of V1 while it lasts), A1 = scene mixes
 * (approved Audio Studio versions), A2 = music that runs across scenes (an audio file from the Assets Library).
 */
export const TimelineTrackSchema = z.enum(["V1", "V2", "A1", "A2"]);
export type TimelineTrack = z.infer<typeof TimelineTrackSchema>;

/** take = an approved generated take; slug = offline placeholder (no media yet); audio_mix = an approved scene mix; music = an audio file (A2). */
export const TimelineClipKindSchema = z.enum(["take", "slug", "audio_mix", "music"]);
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

/**
 * How a picture clip starts and ends (migration 0041). Timing never changes: a dissolve blends in from the last frame of
 * the picture before it over the clip's first `frames`, a fade goes from/to black over its first/last `frames`.
 */
export const ClipTransitionSchema = z
  .object({
    in: z.enum(["cut", "dissolve", "fade_from_black"]).default("cut"),
    out: z.enum(["cut", "fade_to_black"]).default("cut"),
    frames: z.number().int().min(2).max(96).default(12),
  })
  .strict();
export type ClipTransition = z.infer<typeof ClipTransitionSchema>;
export const NO_TRANSITION: ClipTransition = { in: "cut", out: "cut", frames: 12 };

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
  transition: ClipTransitionSchema.default(NO_TRANSITION),
  /** A2 music: the Assets Library file it plays (migration 0045). */
  asset_id: z.string().uuid().nullable().default(null),
  /** A2 music: its level under the scene mixes (dB). */
  gain_db: z.number().min(-60).max(12).default(0),
});
export type TimelineClip = z.infer<typeof TimelineClipSchema>;

const delta = z.number().int().min(-24 * 60 * 60).max(24 * 60 * 60);
const clipId = z.string().uuid();
const at = frame;
/** What to put on the timeline. The server resolves it to the CURRENTLY approved take / scene mix. */
export const EditSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shot"), shot_id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal("scene_mix"), scene_id: z.string().uuid() }).strict(),
  /** An approved shot shown over the picture on V2 (an insert or cutaway); never moves the cut. */
  z.object({ kind: z.literal("insert_shot"), shot_id: z.string().uuid() }).strict(),
  /** An audio file from the Assets Library on A2 (music across scenes); never moves the cut. */
  z.object({ kind: z.literal("music"), asset_id: z.string().uuid(), gain_db: z.number().min(-60).max(12).optional() }).strict(),
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
  z.object({ op: z.literal("transition"), clip_id: clipId, transition: ClipTransitionSchema }).strict(),
  /** A music clip's level (A2). */
  z.object({ op: z.literal("gain"), clip_id: clipId, gain_db: z.number().min(-60).max(12) }).strict(),
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
/** Undo the newest edit made on this revision (migration 0054); the cut before it comes back with its revision. */
export const UndoTimelineSchema = z.object({ base_revision: z.string().uuid(), break_lock: z.boolean().optional() }).strict();
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
