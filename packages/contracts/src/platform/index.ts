import { z } from "zod";

// Canonical owner: Platform (see docs/architecture/DATA_AUTHORITY.md).
// Immutable actor/action/version history. Written by DB triggers in Phase 1
// (see packages/database/migrations); moves to a full transactional outbox
// consumed by workers once MOS lands (SRS §2.2, §14).

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  actor_id: z.string().uuid().nullable(),
  action: z.string(),
  object_type: z.string(),
  object_id: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
