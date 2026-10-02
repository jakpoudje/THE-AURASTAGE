import type { AudioClip, AudioTrack, PictureImpact, SessionMix, TimelineAutomation, TimelineClip } from "@aurastage/contracts";

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
/** An approved scene mix as Audio Studio approved it: tracks with their channel strips, clips and the routing. */
export interface MixSnapshot { id: string; scene_id: string | null; version_number: number; seconds: number; tracks: AudioTrack[]; clips: AudioClip[]; mix?: SessionMix }

/** Response of GET /api/projects/:id/editorial (apps/api/src/modules/editorial). */
/** A sound from Audio Studio at the frame it happens in the cut (planned = no audio chosen yet). */
export interface SoundCue { scene_id: string; clip_id: string; label: string; family: string; planned: boolean; at: number; frames: number }

export interface EditorialWorkspace {
  fps: number;
  /** Effects, Foley, ambience and crowd from Audio Studio, placed on the cut (read-only here; owner request 2026-10-01). */
  sound_cues?: SoundCue[];
  project: { title: string; target_runtime_minutes: number | null };
  timeline: {
    id: string; status: "draft" | "locked"; revision: string; review_state: "current" | "review_required"; review_reason: string | null;
    lock: { lock_number: number; locked_at: string } | null; updated_at: string;
    /** Volume automation of the cut's sound (migration 0032) and its own revision. */
    automation: TimelineAutomation; automation_revision: string;
    /** What Undo (Ctrl+Z) would take back on this revision (migration 0054), or null. */
    undo?: { action: string; summary: string } | null;
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
  /** Audio files from the Assets Library the music track (A2) can use (music first). */
  music_library?: { asset_id: string; name: string; category: string | null; seconds: number | null }[];
}
export type Tool = "select" | "ripple" | "roll" | "slip" | "slide" | "blade" | "draw";
