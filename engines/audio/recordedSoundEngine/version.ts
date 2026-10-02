export const ENGINE_ID = "audio.recordedSoundEngine";
/** 1.0.0 (owner request 2026-10-02: "real life prop sounds"): real recordings from the built-in library chosen and laid out per cue. */
export const ENGINE_VERSION = "1.0.0";
/** Deterministic (same cue + seed + library = same choice and samples). No AI, no provider. */
export const ENGINE_KIND = "deterministic" as const;
