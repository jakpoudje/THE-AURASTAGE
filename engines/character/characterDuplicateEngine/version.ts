export const ENGINE_ID = "character.characterDuplicateEngine";
/** 1.0.0: likely duplicates by shared first/last name, titles, "(V.O.)"-style extensions and one-letter typos. */
export const ENGINE_VERSION = "1.0.0";
/** Deterministic; it only suggests — a person merges (merge_characters) or says "not the same". */
export const ENGINE_KIND = "deterministic" as const;
