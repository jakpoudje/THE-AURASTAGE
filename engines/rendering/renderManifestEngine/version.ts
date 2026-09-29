export const ENGINE_ID = "rendering.renderManifestEngine";
/** 1.2.0: scene mixes carry their channel strips (fx) and session routing (mix). */
export const ENGINE_VERSION = "1.2.0";
/** Deterministic, immutable render specification (SRS §12 RenderManifest). */
export const ENGINE_KIND = "deterministic" as const;
export const MANIFEST_SCHEMA = "aurastage.render-manifest/1";
