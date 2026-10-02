export const ENGINE_ID = "editorial.editDecisionEngine";
/** 1.1.0: transitions (dissolve, fade from/to black) on picture clips. */
/** 1.1.1: a transition that no longer fits after an edit shrinks to fit (or becomes a cut) instead of blocking the edit. */
/** 1.2.0: inserts over the picture (V2) and music across scenes (A2) are laid on their own track and ride with ripples; music level (gain). */
/** 1.3.0: conform also lays approved scene mixes that aren't on the cut yet, in sync with their picture (free space only). */
export const ENGINE_VERSION = "1.3.0";
/** Deterministic NLE edit semantics. No AI. */
export const ENGINE_KIND = "deterministic" as const;
