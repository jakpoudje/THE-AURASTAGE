/** A single speech longer than this (words) is flagged as a long speech/monologue to review. */
export const LONG_SPEECH_WORDS = 60;
/** One speaker holding more than this share of a multi-speaker scene's words is flagged as dominant. */
export const DOMINANT_SHARE = 0.75;
/** Dominance is only meaningful with enough dialogue in the scene. */
export const DOMINANT_MIN_LINES = 6;
