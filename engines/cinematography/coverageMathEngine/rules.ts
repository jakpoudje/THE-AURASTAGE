/** A plan is viable when mandatory story time is (almost) fully covered (SRS §9.1: C≈1). */
export const MIN_COVERAGE = 0.95;
/** Longer single takes are allowed but flagged for a person to confirm. */
export const LONG_SHOT_SECONDS = 60;
/** Gaps shorter than this are rounding noise, not missing coverage. */
export const GAP_EPSILON = 0.05;
