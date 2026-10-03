export const ENGINE_ID = "world.propContinuityEngine";
/** 1.0.0: each prop's state scene by scene from the script lines it appears on (broken, bloodied, burnt, torn, missing…), carried forward until the script restores it; warnings where a later scene may forget it; the set dressing per scene. */
/** 1.1.0 (2026-10-03): a state word must describe the prop (same clause, next to it); an everyday item's lasting state only carries within one place; one warning per state, listing its scenes. */
export const ENGINE_VERSION = "1.1.0";
/** Built-in story intelligence: deterministic, free, no AI provider. */
export const ENGINE_KIND = "deterministic" as const;
