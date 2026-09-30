export const ENGINE_ID = "cinematography.shotPlanningEngine";
/** 1.1.0: coverage styles (standard, simple, intimate, energetic). 1.1.1: long Scene DNA text fits a shot (≤500). 1.2.0: every shot gets its composition. */
export const ENGINE_VERSION = "1.2.0";
/** Deterministic coverage proposal from a locked Scene DNA version. No AI calls. */
export const ENGINE_KIND = "deterministic" as const;
