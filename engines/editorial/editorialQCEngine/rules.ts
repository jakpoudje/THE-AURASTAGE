// Editorial QC thresholds (SRS §12 / §15 editorialQCEngine: gaps, flash frames,
// offline/temp media and sync).
/** A picture clip shorter than this reads as a flash frame (0.25 s at 24 fps). */
export const FLASH_FRAME_MAX = 5;
/** Runtime is flagged when it is outside ±10 % of the target. */
export const RUNTIME_TOLERANCE = 0.1;
