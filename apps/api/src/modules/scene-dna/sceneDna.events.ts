// apps/api/src/modules/scene-dna/sceneDna.events.ts
// Written transactionally into audit_events by the migration-0011 functions.
export const SCENE_DNA_EVENTS = {
  Updated: "SceneDNAUpdated",
  Approved: "SceneDNAApproved",
  UpstreamChanged: "UpstreamVersionChanged",
} as const;
