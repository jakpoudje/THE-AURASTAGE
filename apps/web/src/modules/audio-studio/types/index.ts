import type { AudioClip, AudioTrack, ReadinessPredicate } from "@aurastage/contracts";

export interface AudioMeasurement {
  id: string; session_revision: string; integrated_lufs: number | null; true_peak_dbtp: number | null; lra_lu: number | null;
  duration_seconds: number; clip_count: number; engine_version: string; measured_at: string;
}
export interface AudioScene {
  scene: { id: string; number: number; heading: string };
  plan: { version_id: string; version_number: number; usable: boolean } | null;
  session: {
    id: string; status: "draft" | "approved"; review_state: "current" | "review_required" | "stale"; review_reason: string | null;
    revision: string; scene_seconds: number; approved_version_number: number | null;
  } | null;
  tracks: AudioTrack[];
  clips: AudioClip[];
  measurement: AudioMeasurement | null;
  readiness: ReadinessPredicate[];
  ready_for_approval: boolean;
}
export interface AudioAsset { id: string; name: string; duration_seconds: number | null; media_type: string | null; created_at: string }

/** Response of GET /api/projects/:id/audio (apps/api/src/modules/audio). */
export interface AudioWorkspace {
  target: { integrated_lufs: number; tolerance_lu: number; max_true_peak_dbtp: number };
  generators: { id: string; label: string; note: string; state: "not_connected" }[];
  assets: AudioAsset[];
  scenes: AudioScene[];
  summary: { scenes: number; spotted: number; approved: number };
}
