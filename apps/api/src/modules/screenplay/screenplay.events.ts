// apps/api/src/modules/screenplay/screenplay.events.ts
// Typed domain events emitted after committed changes.
// Domain: Scriptwriter
// Canonical object: Script / Scene
//
// Written transactionally into audit_events by the save_script_version /
// approve_script_version database functions
// (packages/database/migrations/0004_phase2_scriptwriter.sql). Casting
// (Phase 3) listens for ScriptApproved to start character extraction.

export const SCRIPT_EVENTS = {
  VersionSaved: "ScriptVersionSaved",
  Approved: "ScriptApproved",
} as const;
