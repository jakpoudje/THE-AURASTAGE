export const ENGINE_ID = "orchestration.productionOverviewEngine";
export const ENGINE_VERSION = "1.0.0";
/** Deterministic: each stage's own read model -> stage states with the counts and checks behind them (rule 12). */
export const ENGINE_KIND = "deterministic" as const;
