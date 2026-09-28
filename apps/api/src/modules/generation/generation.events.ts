// apps/api/src/modules/generation/generation.events.ts
// Written transactionally into audit_events by the migration-0013 functions.
export const GENERATION_EVENTS = {
  PackageCompiled: "GenerationPackageCompiled",
  TakesRequested: "TakesRequested",
  TakeGenerated: "TakeGenerated",
  TakeFailed: "TakeFailed",
  TakeApproved: "TakeApproved",
  TakeRejected: "TakeRejected",
  TakeReopened: "TakeReopened",
  UpstreamChanged: "UpstreamVersionChanged",
} as const;
