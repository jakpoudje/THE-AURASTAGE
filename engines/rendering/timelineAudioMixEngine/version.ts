export const ENGINE_ID = "rendering.timelineAudioMixEngine";
/** 2.0.0: scene mixes render through the full studio chain (studioMixRenderEngine), not fader/pan only. */
export const ENGINE_VERSION = "2.0.0";
/** Deterministic PCM mix of the locked cut's scene mixes. */
export const ENGINE_KIND = "deterministic" as const;
