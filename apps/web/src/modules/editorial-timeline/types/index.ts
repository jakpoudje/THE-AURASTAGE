import type { AudioClip, AudioTrack, PictureImpact, TimelineClip } from "@aurastage/contracts";

export interface QCCheck {
  id: string; label: string; ok: boolean; blocking: boolean; evidence: string;
  at: { clip_id: string | null; frame: number; timecode: string; note: string }[];
}
export interface BinShot {
  shot_id: string; ordinal: number; size: string | null; description: string; seconds: number;
  take: { take_id: string; take_number: number; capability: string; source_frames: number | null } | null;
}
export interface BinScene {
  scene_id: string; number: number; heading: string;
  plan: { version_number: number; usable: boolean } | null;
  shots: BinShot[];
  mix: { version_id: string; version_number: number; seconds: number } | null;
  mix_note: string | null;
}
export interface MixSnapshot { id: string; scene_id: string | null; version_number: number; seconds: number; tracks: AudioTrack[]; clips: AudioClip[] }

/** Response of GET /api/projects/:id/editorial (apps/api/src/modules/editorial). */
export interface EditorialWorkspace {
  fps: number;
  project: { title: string; target_runtime_minutes: number | null };
  timeline: {
    id: string; status: "draft" | "locked"; revision: string; review_state: "current" | "review_required"; review_reason: string | null;
    lock: { lock_number: number; locked_at: string } | null; updated_at: string;
  } | null;
  clips: TimelineClip[];
  issues: { clip_id: string; code: string; message: string }[];
  conformable: number;
  qc: { checks: QCCheck[]; ready_for_lock: boolean; duration_frames: number; engine_version: string };
  versions: { id: string; version_number: number; label: string; kind: "manual" | "auto" | "picture_lock"; duration_frames: number; created_at: string }[];
  locks: { lock_number: number; locked_at: string; broken_at: string | null; impact: PictureImpact[] | null }[];
  bin: BinScene[];
  media: Record<string, { url: string | null; media_type: string | null; capability: string; take_number: number }>;
  mixes: Record<string, MixSnapshot>;
}
export type Tool = "select" | "ripple" | "roll" | "slip" | "slide" | "blade";
