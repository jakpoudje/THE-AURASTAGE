// Each scene mix is rendered with engines/audio/studioMixRenderEngine — the Audio Studio's own chain (channel strips,
// buses, reverb/delay, master limiter), checked against the browser by tests/e2e/audio-parity — then placed on the
// timeline at its A1 position. A scene mix plays only for its approved length.
export const dbToGain = (db: number) => Math.pow(10, db / 20);
/** Rendered scene mixes kept while a film is rendered chunk by chunk (they are used in timeline order). */
export const SCENE_CACHE_SIZE = 3;
