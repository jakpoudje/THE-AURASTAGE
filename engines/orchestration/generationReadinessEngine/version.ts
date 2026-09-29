export const ENGINE_ID = "orchestration.generationReadinessEngine";
export const ENGINE_VERSION = "1.0.0";
/** Deterministic: states come only from configured backends and recorded results — never estimated (rule 12). */
export const ENGINE_KIND = "deterministic" as const;
