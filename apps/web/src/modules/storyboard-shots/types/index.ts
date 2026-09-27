import type { ReadinessPredicate, Shot, ShotPlan } from "@aurastage/contracts";

export interface StoryboardCoverage {
  coverage: number;
  covered_seconds: number;
  gaps: { start: number; end: number }[];
  uncovered_lines: string[];
  unseen_characters: string[];
  screen_seconds: number;
  shot_count: number;
  readiness: ReadinessPredicate[];
  ready_for_approval: boolean;
  engine_version: string;
}

export interface StoryboardScene {
  scene: { id: string; number: number; heading: string; int_ext: string; location: string; time_of_day: string | null; status: "active" | "omitted" };
  dna: {
    state: "not_locked" | "locked" | "needs_review";
    version_id: string | null;
    version_number: number | null;
    duration_seconds: number | null;
    mood: string[];
    camera_energy: string | null;
  };
  characters: { id: string; name: string; presence: "on_screen" | "voice_only" }[];
  lines: { id: string; label: string; character_id: string | null }[];
  plan: ShotPlan | null;
  shots: Shot[];
  coverage: StoryboardCoverage | null;
}

/** Response of GET /api/projects/:id/storyboard (apps/api/src/modules/shots). */
export interface StoryboardWorkspace {
  scenes: StoryboardScene[];
  summary: { scenes: number; dna_locked: number; planned: number; approved: number; shots: number; needs_review: number };
}
