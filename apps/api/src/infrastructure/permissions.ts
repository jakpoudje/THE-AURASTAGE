// apps/api/src/infrastructure/permissions.ts
// Cross-cutting: every write goes through the database permission gate
// (public.gate_write, migration 0019), which refuses with "AURA-COL-403: <reason>".
// Domain repositories use this to pass that plain-language reason to the screen
// ("your role (Writer) can't approve in Scriptwriter") instead of a generic message.

/** The permission gate's reason, or undefined when the error didn't come from the gate. */
export function colForbiddenMessage(error: { message?: string } | null | undefined): string | undefined {
  const msg = error?.message ?? "";
  return msg.startsWith("AURA-COL-403") ? msg.replace(/^AURA-COL-403:\s*/, "") : undefined;
}
