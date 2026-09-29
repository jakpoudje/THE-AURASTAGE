export const ENGINE_ID = "audio.studioMixRenderEngine";
/** 1.1.0: low-pass filter in the channel strip (phone, radio, next room, muffled). */
export const ENGINE_VERSION = "1.1.0";
/** Deterministic offline render of an Audio Studio mix: the same studio chain as the browser, for the render worker. */
export const ENGINE_KIND = "deterministic" as const;
