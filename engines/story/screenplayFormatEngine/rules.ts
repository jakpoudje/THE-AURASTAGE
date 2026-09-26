// Formatting rules for the Fountain-style screenplay subset AuraStage accepts.
// Kept separate from engine.ts so the rules are reviewable on their own.

/** Scene headings start with one of these prefixes (case-insensitive), or are forced with a leading ".". */
export const SCENE_HEADING_RE = /^(INT\.?\/EXT\.?|INT\/EXT|I\/E|INT\.|EXT\.|EST\.|INT |EXT )/i;

/** Transitions: an all-caps line ending in "TO:", plus these standard fixed transitions. */
export const TRANSITION_RE = /^[A-Z0-9 .'-]+TO:$/;
export const FIXED_TRANSITIONS = new Set(["FADE IN:", "FADE OUT.", "FADE OUT:", "FADE TO BLACK.", "CUT TO BLACK.", "THE END"]);

/** Character extensions recognised in cues, e.g. "AMARA (V.O.)". */
export const CUE_EXTENSION_RE = /\(([^)]*)\)/g;

/** A line counts as upper case when it has at least one letter and no lower-case letters. */
export function isUpperCaseLine(line: string): boolean {
  return /[A-Z]/.test(line) && line === line.toUpperCase();
}

/** Lines that look like a cue but are conventionally action, not speakers. */
export const NOT_A_SPEAKER_PREFIXES = ["SUPER:", "TITLE:", "INSERT:", "BACK TO", "MONTAGE", "SERIES OF SHOTS", "END MONTAGE", "LATER"];
