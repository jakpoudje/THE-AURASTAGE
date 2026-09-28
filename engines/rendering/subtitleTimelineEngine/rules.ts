// Subtitle readability rules (common broadcast/streaming practice).
export const MAX_CHARS_PER_LINE = 42;
export const MAX_LINES = 2;
/** Reading speed above this many characters per second is flagged. */
export const MAX_CPS = 20;
/** Cues shorter than this are extended when there is room (seconds). */
export const MIN_SECONDS = 1;
/** Frames kept free between consecutive cues. */
export const GAP_FRAMES = 2;
