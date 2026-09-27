// apps/api/src/modules/shots/shots.events.ts
// Written transactionally into audit_events by the migration-0012 functions.
export const SHOT_EVENTS = {
  PlanGenerated: "ShotPlanGenerated",
  Added: "ShotAdded",
  Updated: "ShotUpdated",
  Moved: "ShotMoved",
  Deleted: "ShotDeleted",
  PlanApproved: "ShotPlanApproved",
  UpstreamChanged: "UpstreamVersionChanged",
} as const;
