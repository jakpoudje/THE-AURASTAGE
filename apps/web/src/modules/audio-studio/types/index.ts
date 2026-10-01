import type { AudioClip, AudioTrack, ReadinessPredicate, SessionMix } from "@aurastage/contracts";

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
    /** Routing: department buses, shared reverb and delay, master with limiter. */
    mix: SessionMix;
  } | null;
  tracks: AudioTrack[];
  clips: AudioClip[];
  measurement: AudioMeasurement | null;
  readiness: ReadinessPredicate[];
  ready_for_approval: boolean;
  /** Sound generated for this scene (newest first); files land in the Assets Library. */
  generations: AudioGeneration[];
  /** The scene's suggested music from the built-in library (free; the built-in generator plays exactly this style). */
  music_suggestion?: MusicSuggestion;
}
export interface MusicSuggestion {
  needed: boolean; style: { id: string; name: string }; key: string; tempo_bpm: number; description: string;
  instruments: string[]; placement: string; level_db: number; why: string[]; engine_version: string;
  /** A free ambient bed in the scene's mood (musicSuggestionEngine 1.1.0). */
  ambient?: { description: string; level_db: number; why: string };
}
export interface AudioGeneration {
  id: string; scene_id: string; clip_id: string | null; kind: "ambience" | "fx" | "foley" | "score" | "voice"; description: string; duration_seconds: number;
  provider: string; model: string; execution: string; seed: number; status: "queued" | "running" | "succeeded" | "failed"; asset_id: string | null; error: string | null;
  layers: { name: string; because: string }[]; created_at: string; completed_at: string | null;
}
export interface AudioAsset { id: string; name: string; duration_seconds: number | null; media_type: string | null; created_at: string }

/** Response of GET /api/projects/:id/audio (apps/api/src/modules/audio). */
export interface AudioWorkspace {
  target: { integrated_lufs: number; tolerance_lu: number; max_true_peak_dbtp: number };
  generators: { id: string; label: string; note: string; state: "configured" | "not_configured" | "not_connected"; execution: string; kinds: string[] }[];
  assets: AudioAsset[];
  scenes: AudioScene[];
  summary: { scenes: number; spotted: number; approved: number };
}
