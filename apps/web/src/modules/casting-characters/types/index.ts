import type { Character, CharacterAlias, CharacterAppearance } from "@aurastage/contracts";
import type { CharacterCandidate } from "@aurastage/engines";

/** Response of GET /api/projects/:id/characters (apps/api/src/modules/characters). */
export interface CastingWorkspace {
  characters: Character[];
  aliases: CharacterAlias[];
  appearances: CharacterAppearance[];
  script: { approved_version_id: string; version_number: number } | null;
  sync: {
    state: "no_script" | "never" | "current" | "stale";
    synced_version_id: string | null;
    synced_at: string | null;
    engine_version: string | null;
    new_from_script: number;
  };
  pending: CharacterCandidate[];
}
