import type { SceneDnaEditable, SceneDnaRecord } from "@aurastage/contracts";
import type { SceneDnaProposal } from "@aurastage/engines";

export interface SceneDnaSceneSummary {
  id: string;
  number: number;
  heading: string;
  int_ext: string;
  location: string;
  time_of_day: string | null;
  estimated_seconds: number;
  status: "active" | "omitted";
}

export interface SceneDnaEntry {
  scene: SceneDnaSceneSummary;
  record: SceneDnaRecord | null;
  editable: SceneDnaEditable;
  proposal: SceneDnaProposal;
  looks: { id: string; character_id: string; name: string; description: string | null }[];
  /** The participants' ages from Casting (flashbacks, time jumps). */
  ages?: { id: string; character_id: string; label: string; age: string; description: string | null }[];
  /** Story-time clues found in the script's own words (storyTimeCueEngine). */
  story_time?: {
    other_time: boolean;
    cues: { kind: "flashback" | "back_to_present" | "time_jump" | "year" | "character_age"; text: string; where: "heading" | "action"; line: number | null; character_id?: string; age?: string }[];
  };
  engine_version: string;
}

/** Response of GET /api/projects/:id/scene-dna (apps/api/src/modules/scene-dna). */
export interface SceneDnaWorkspace {
  script: { approved_version_id: string; version_number: number } | null;
  scenes: SceneDnaEntry[];
  summary: { scenes: number; approved: number; ready: number; needs_review: number };
}
