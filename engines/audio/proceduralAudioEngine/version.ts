export const ENGINE_ID = "audio.proceduralAudioEngine";
/** 1.1.0: main theme melody. 1.2.0: "ambient" score cues play as a slow, soft ambient bed (owner request 2026-10-01). */
export const ENGINE_VERSION = "1.2.0";
/** Deterministic synthesis (same input + seed = same samples). AuraStage's built-in sound: no AI, no provider. */
export const ENGINE_KIND = "deterministic" as const;
