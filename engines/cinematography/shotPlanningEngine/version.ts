export const ENGINE_ID = "cinematography.shotPlanningEngine";
/** 1.1.0: coverage styles (standard, simple, intimate, energetic). 1.1.1: long Scene DNA text fits a shot (≤500). */
export const ENGINE_VERSION = "1.1.1";
/** Deterministic coverage proposal from a locked Scene DNA version. No AI calls. */
export const ENGINE_KIND = "deterministic" as const;
