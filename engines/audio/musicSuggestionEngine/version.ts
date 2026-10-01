export const ENGINE_ID = "audio.musicSuggestionEngine";
/** 1.0.0: one suggested cue per scene from the built-in music library (mood, tempo, key, where it sits, what plays it), the film's theme. */
/** 1.1.0: an ambient bed for every scene (owner request 2026-10-01). */
export const ENGINE_VERSION = "1.1.0";
/** Built-in story intelligence: deterministic, free, no AI provider. */
export const ENGINE_KIND = "deterministic" as const;
