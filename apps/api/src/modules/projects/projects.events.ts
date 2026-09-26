// apps/api/src/modules/projects/projects.events.ts
// Typed domain events emitted after committed changes.
// Domain: Projects
//
// Phase 1: ProjectCreated / ProjectUpdated / ProjectDeleted are written
// transactionally into audit_events by a DB trigger
// (packages/database/migrations/0003_phase1_project_audit_trigger.sql), not
// dispatched from application code yet. This file documents the event names
// so downstream domains (Scene DNA, MOS) know what to listen for once a real
// event bus / outbox worker exists (SRS §2.2, §14).

export const PROJECT_EVENTS = {
  Created: "ProjectCreated",
  Updated: "ProjectUpdated",
  Deleted: "ProjectDeleted",
} as const;
