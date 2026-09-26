// Evidence weights for P(real character | x) = σ(w0 + Σ wᵢxᵢ) (SRS §6.1).
// Tuned so: any spoken cue => ~1.0 (forced), CAPS introduction with age => ~0.9,
// CAPS introduction without age => ~0.6 (needs confirmation).
export const WEIGHTS = {
  bias: -2.0,
  cue: 4.0, // per scene with a spoken cue, capped
  introductionWithAge: 4.2,
  introductionNoAge: 2.4,
  mention: 0.6, // per extra scene mention, capped
  maxCueScenes: 3,
  maxMentionScenes: 3,
} as const;

export const AUTO_ACCEPT_THRESHOLD = 0.8;

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Cue extensions that mean "heard, not seen" in this moment. */
export const VOICE_ONLY_EXTENSIONS = new Set(["V.O.", "VO", "O.S.", "OS", "O.C.", "OC", "V.O", "O.S", "PHONE", "FILTERED", "RADIO", "ON PHONE", "ON RADIO", "INTO PHONE"]);

/** Cues that denote a crowd/group rather than one person (SRS §6.1: group entity). */
export const GROUP_RE = /^(ALL|EVERYONE|BOTH|CROWD|CHORUS|VOICES|PEOPLE|MEN|WOMEN|KIDS|CHILDREN|GUARDS|SOLDIERS|POLICE|OFFICERS|REPORTERS|STUDENTS|WORKERS|PROTESTERS|FANS|TOGETHER|THE [A-Z]+S|(TWO|THREE|FOUR|FIVE|SEVERAL|MANY|SOME) [A-Z]+)$/;

/** Words that appear in CAPS in action lines but are never characters. */
export const NOT_A_NAME = new Set([
  "INT", "EXT", "CUT", "FADE", "SUPER", "TITLE", "CONTINUOUS", "LATER", "NIGHT", "DAY", "MORNING", "EVENING",
  "DAWN", "DUSK", "BOOM", "BANG", "CRASH", "SMASH", "CLOSE", "ANGLE", "POV", "INSERT", "BACK", "FLASHBACK",
  "MONTAGE", "THE", "A", "AN", "AND", "OF", "TO", "IN", "ON", "OFF", "SCREEN", "V", "O", "S", "END", "CONT", "D",
  "TV", "FBI", "CIA", "USA", "UK", "BBC", "CNN", "NYPD", "LAPD", "OK", "SMS", "DNA", "ID", "CEO", "GPS",
]);

/** Introduction pattern: 1-4 CAPS words followed by "(35)" or "(30s)" / "(late 40s)". */
export const INTRO_RE = /\b((?:[A-Z][A-Z'’\-]*\.?)(?:\s+[A-Z][A-Z'’\-]*\.?){0,3})\s*\(((?:early |mid |late |mid-|early-|late-)?\d{1,3}s?)\)/g;
/** CAPS name without age: 2-4 CAPS words (single CAPS words are too noisy: sounds, shouts). */
export const CAPS_NAME_RE = /\b([A-Z][A-Z'’\-]+(?:\s+[A-Z][A-Z'’\-]+){1,3})\b/g;
