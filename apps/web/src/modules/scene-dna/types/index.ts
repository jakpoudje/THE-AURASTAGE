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
  engine_version: string;
}

/** Response of GET /api/projects/:id/scene-dna (apps/api/src/modules/scene-dna). */
export interface SceneDnaWorkspace {
  script: { approved_version_id: string; version_number: number } | null;
  scenes: SceneDnaEntry[];
  summary: { scenes: number; approved: number; ready: number; needs_review: number };
}
