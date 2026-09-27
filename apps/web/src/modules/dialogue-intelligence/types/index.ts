import type { DialogueLine } from "@aurastage/contracts";
import type { SceneBalance, Voiceprint } from "@aurastage/engines";

export interface DialogueScene {
  id: string;
  number: number;
  heading: string;
  status: "active" | "omitted";
  review_state: "current" | "review_required";
}

/** Response of GET /api/projects/:id/dialogue (apps/api/src/modules/dialogue). */
export interface DialogueWorkspace {
  script: { approved_version_id: string; version_number: number } | null;
  sync: { state: "no_script" | "never" | "current" | "stale"; synced_version_id: string | null; synced_at: string | null };
  scenes: DialogueScene[];
  characters: { id: string; name: string }[];
  lines: DialogueLine[];
  analysis: {
    voiceprints: Voiceprint[];
    balance: SceneBalance[];
    unresolved_speakers: string[];
    review_required: number;
  };
}
