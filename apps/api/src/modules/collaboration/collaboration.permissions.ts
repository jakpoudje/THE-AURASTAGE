// apps/api/src/modules/collaboration/collaboration.permissions.ts
// Domain: Team & Collaboration
//
// Authorization is enforced in the database (migration 0019): every write goes through
// public.gate_write(project, module, action) and every read through the project-scoped
// RLS policies. This module only turns the database's AURA-COL-403 into a typed error so
// the plain-language reason ("your role (Writer) can't approve in Scriptwriter") reaches
// the screen. Other modules use colForbiddenMessage() the same way.

export class CollaborationForbiddenError extends Error {
  code = "AURA-COL-403";
  constructor(message = "You don't have access to this") {
    super(message);
  }
}

export { colForbiddenMessage } from "../../infrastructure/permissions";
