// A manifest is only produced when every frame and every sound of the locked
// cut resolves to stored master media (SRS §15 renderDependencyResolverEngine:
// masters, never proxies or placeholders). Otherwise the caller gets `missing`.
export const NEEDS_PICTURE = new Set(["streaming_master", "review_copy", "mezzanine_master"]);
export const NEEDS_AUDIO = new Set(["streaming_master", "review_copy", "mezzanine_master", "audio_package"]);
