// apps/api/src/modules/rendering/rendering.events.ts
// Written transactionally into audit_events by the migration-0018 functions.
export const RENDERING_EVENTS = {
  Requested: "RenderRequested",
  CancelRequested: "RenderCancelRequested",
  Completed: "RenderCompleted",
  Failed: "RenderFailed",
  Cancelled: "RenderCancelled",
  UpstreamChanged: "UpstreamVersionChanged",
} as const;
