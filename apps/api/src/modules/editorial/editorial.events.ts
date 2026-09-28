// apps/api/src/modules/editorial/editorial.events.ts
// Written transactionally into audit_events by the migration-0017 functions.
export const EDITORIAL_EVENTS = {
  Edited: "TimelineEdited",
  VersionSaved: "TimelineVersionSaved",
  PictureLocked: "PictureLocked",
  PictureLockBroken: "PictureLockBroken",
  UpstreamChanged: "UpstreamVersionChanged",
} as const;
