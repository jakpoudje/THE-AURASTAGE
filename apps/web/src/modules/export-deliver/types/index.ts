import type { DeliveryQCCheck } from "@aurastage/contracts";

export interface DeliveryProfile {
  id: string; version: string; label: string; category: string; description: string; available: boolean; unavailable_reason: string | null;
  container: string | null;
  video: { codec: string; width: number; height: number; pix_fmt: string; quality: string; color: string } | null;
  audio: { codec: string; sample_rate: number; channels: number; bitrate: string | null } | null;
  loudness: { integrated_lufs: number; tolerance_lu: number; max_true_peak_dbtp: number } | null;
  files: string[];
  supports: { watermark: boolean; burn_timecode: boolean; subtitles_sidecar: boolean };
}
export interface Deliverable {
  id: string; profile_id: string; profile_label: string; profile_version: string; lock_number: number; options: { watermark?: string | null; burn_timecode?: boolean };
  manifest_sha256: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; progress: number; stage: string | null; error: string | null;
  cancel_requested: boolean; qc: { checks: DeliveryQCCheck[]; passed: boolean } | null; qc_passed: boolean | null;
  review_state: "current" | "stale"; review_reason: string | null; created_at: string; started_at: string | null; completed_at: string | null;
  outputs: { name: string; media_type: string; bytes: number; sha256: string; download_name: string; url: string | null; stream_url: string | null }[];
}
export interface PreflightCheck { id: string; label: string; ok: boolean; blocking: boolean; evidence: string }

/** Response of GET /api/projects/:id/delivery (apps/api/src/modules/rendering). */
export interface DeliveryWorkspace {
  project: { id: string; title: string };
  picture_lock: { id: string; lock_number: number; locked_at: string; duration_frames: number; fps: number } | null;
  timeline_status: "draft" | "locked" | null;
  profiles: DeliveryProfile[];
  preflight: PreflightCheck[];
  /** Required deliverables from Project Settings. */
  required_profiles?: string[];
  renders: Deliverable[];
  preview: { render_id: string; label: string; url: string } | null;
  queue: { waiting: number; running: number };
  destinations: { id: string; label: string; state: "ready" | "not_connected"; note: string }[];
}
