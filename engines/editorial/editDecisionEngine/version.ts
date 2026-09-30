export const ENGINE_ID = "editorial.editDecisionEngine";
/** 1.1.0: transitions (dissolve, fade from/to black) on picture clips. */
/** 1.1.1: a transition that no longer fits after an edit shrinks to fit (or becomes a cut) instead of blocking the edit. */
export const ENGINE_VERSION = "1.1.1";
/** Deterministic NLE edit semantics. No AI. */
export const ENGINE_KIND = "deterministic" as const;
