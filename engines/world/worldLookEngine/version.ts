export const ENGINE_ID = "world.worldLookEngine";
/** 1.1.0: story-timing words (CONTINUOUS, SAME TIME, MOMENTS LATER…) are not lighting conditions — no views of their own. */
export const ENGINE_VERSION = "1.1.0";
/** Deterministic: one identity description per location / prop and a consistent prompt per reference view. */
export const ENGINE_KIND = "deterministic" as const;
