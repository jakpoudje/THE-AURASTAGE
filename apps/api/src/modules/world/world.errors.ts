// Locations & Props — errors with the AURA-WLD subsystem code (CLAUDE.md traceability convention).
import { colForbiddenMessage } from "../../infrastructure/permissions";

export class WorldValidationError extends Error { code = "AURA-WLD-400"; constructor(public issues: unknown[], message: string) { super(message); } }
export class WorldForbiddenError extends Error { code = "AURA-WLD-403"; }
export class WorldNotFoundError extends Error { code = "AURA-WLD-404"; }
export class WorldConflictError extends Error { code = "AURA-WLD-409"; }
export class WorldNotReadyError extends Error { code = "AURA-WLD-412"; }

export function mapDbError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? "";
  const text = msg.replace(/^AURA-[A-Z]+-\d+:\s*/, "");
  if (/^AURA-WLD-(409|429)/.test(msg)) return new WorldConflictError(text);
  if (msg.startsWith("AURA-WLD-404")) return new WorldNotFoundError(text);
  if (msg.startsWith("AURA-WLD-400") || msg.startsWith("AURA-AST-400")) return new WorldValidationError([], text);
  if (msg.startsWith("AURA-COL-403") || error.code === "42501") return new WorldForbiddenError(colForbiddenMessage(error));
  return Object.assign(new Error(msg || "Database error"), { cause: error });
}
