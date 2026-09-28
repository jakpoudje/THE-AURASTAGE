// Domain: Project Settings. Error prefix AURA-SET.
import type { ZodTypeAny, z } from "zod";

export class SettingsValidationError extends Error {
  code = "AURA-SET-400";
  constructor(public issues: unknown, message = "Invalid settings") {
    super(message);
  }
}
export class SettingsNotFoundError extends Error {
  code = "AURA-SET-404";
}
export class SettingsConflictError extends Error {
  code = "AURA-SET-409";
}
export class SettingsForbiddenError extends Error {
  code = "AURA-SET-403";
}
export function parse<S extends ZodTypeAny>(schema: S, payload: unknown): z.infer<S> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    throw new SettingsValidationError(r.error.issues, i ? `${i.path.join(".") || "settings"}: ${i.message}` : "Invalid settings");
  }
  return r.data;
}

/** Dotted paths of the leaf values that differ, e.g. ["technical.loudness_standard"]. */
export function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    return [...keys].sort().flatMap((k) => changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ? [] : [prefix];
}
