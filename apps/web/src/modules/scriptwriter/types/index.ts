import type { Scene, Script, ScriptVersion } from "@aurastage/contracts";
import type { ScriptAnalysis } from "@aurastage/engines";

export type VersionSummary = Pick<ScriptVersion, "id" | "version_number" | "note" | "parser_version" | "created_at">;

/** Response of GET /api/projects/:id/script (apps/api/src/modules/screenplay). */
export interface ScriptWorkspace {
  script: Script | null;
  current_version: ScriptVersion | null;
  versions: VersionSummary[];
  scenes: Scene[];
  analysis: ScriptAnalysis | null;
}

export type ScriptwriterStep =
  | "setup"
  | "development"
  | "outline"
  | "generate"
  | "edit"
  | "breakdown"
  | "characters";
