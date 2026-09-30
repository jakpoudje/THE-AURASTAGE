// Which profile fields are still empty, and which character needs work next (owner request 2026-09-30: "save and
// continue to the next logical step"). Pure; shared by the profile, the whole-cast bar and "Save & next".
import type { Character } from "@aurastage/contracts";

export const PROFILE_FIELDS = ["name", "age", "gender", "nationality", "accent", "languages", "occupation", "description"] as const;
export const STORY_FIELDS = ["personality", "backstory", "motivation", "fears", "strengths", "weaknesses", "arc"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number] | (typeof STORY_FIELDS)[number];

export function emptyFields(c: Partial<Record<ProfileField, unknown>>): ProfileField[] {
  return ([...PROFILE_FIELDS, ...STORY_FIELDS] as ProfileField[]).filter((k) => k !== "name" && !String(c[k] ?? "").trim());
}

/** A character is complete when every field is written and it is approved. */
export const isComplete = (c: Character) => emptyFields(c as never).length === 0 && c.status === "approved";

/** The next character that still needs work, after `afterId` in list order (wrapping), or null when the cast is done. */
export function nextToComplete(list: Character[], afterId: string | null): Character | null {
  const start = Math.max(0, list.findIndex((c) => c.id === afterId) + 1);
  const order = [...list.slice(start), ...list.slice(0, start)];
  return order.find((c) => c.id !== afterId && !isComplete(c)) ?? null;
}
