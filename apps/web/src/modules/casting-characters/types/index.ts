import type { Character, CharacterAlias, CharacterAppearance, CharacterRelationship, WardrobeLook } from "@aurastage/contracts";
import type { CharacterCandidate, StoryAccentOutput } from "@aurastage/engines";

/** Response of GET /api/projects/:id/characters (apps/api/src/modules/characters). */
export interface CastingWorkspace {
  characters: Character[];
  aliases: CharacterAlias[];
  appearances: CharacterAppearance[];
  relationships: CharacterRelationship[];
  wardrobe_looks: WardrobeLook[];
  script: { approved_version_id: string; version_number: number } | null;
  sync: {
    state: "no_script" | "never" | "current" | "stale";
    synced_version_id: string | null;
    synced_at: string | null;
    engine_version: string | null;
    new_from_script: number;
  };
  pending: CharacterCandidate[];
  /** How each character might speak, suggested from the story (never from a name), by character id. */
  accent_suggestions?: Record<string, StoryAccentOutput>;
  /** Characters that look like the same person, with why and which record to keep. */
  /** Who shares scenes, saved relationships and what the dialogue states (built-in, free). */
  relationship_map?: RelationshipMap;
  duplicates?: { keep_id: string; merge_id: string; keep_name: string; merge_name: string; reason: string; confidence: "high" | "medium" }[];
}

export interface RelationshipMap {
  nodes: { id: string; name: string; scenes: number }[];
  edges: { a: string; b: string; shared_scenes: number; relationship: string | null; suggestion: { relationship: string; evidence: string } | null }[];
  engine_version: string;
}
