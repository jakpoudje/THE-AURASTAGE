export const ENGINE_ID = "generation.promptCompilerEngine";
/** 1.2.0: the scene's canonical location and props (Locations & Props) and reference images for consistency. */
/** 1.3.0: a character's age in this scene (Scene DNA ages, Casting age states) and reference views at that age. */
export const ENGINE_VERSION = "1.3.0";
/** Deterministic compilation of approved upstream versions into a GenerationPackage. No AI calls. */
export const ENGINE_KIND = "deterministic" as const;
