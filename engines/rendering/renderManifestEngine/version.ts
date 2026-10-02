export const ENGINE_ID = "rendering.renderManifestEngine";
/** 1.2.0: scene mixes carry their channel strips (fx) and session routing (mix). 1.3.0: timeline volume automation. 1.4.0: opening title card and end-credits roll on video deliverables. 1.5.0: on-screen text per scene (overlays). 1.6.0: transitions on takes (dissolve, fade from/to black). 1.7.0: inserts over the picture (V2) and music across scenes (A2). 1.8.0: text cards at fixed places (trailers, social cut-downs). 1.9.0: muted Audio Studio clips stay out of the sound and the captions. */
export const ENGINE_VERSION = "1.9.0";
/** Deterministic, immutable render specification (SRS §12 RenderManifest). */
export const ENGINE_KIND = "deterministic" as const;
export const MANIFEST_SCHEMA = "aurastage.render-manifest/1";
