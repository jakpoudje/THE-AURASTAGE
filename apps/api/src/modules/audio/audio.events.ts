// apps/api/src/modules/audio/audio.events.ts
// Written transactionally into audit_events by the migration-0015 functions.
export const AUDIO_EVENTS = {
  Spotted: "AudioSessionSpotted",
  TrackUpdated: "AudioTrackUpdated",
  ClipSaved: "AudioClipSaved",
  ClipDeleted: "AudioClipDeleted",
  Measured: "AudioMixMeasured",
  Approved: "AudioSessionApproved",
  UpstreamChanged: "UpstreamVersionChanged",
} as const;
