export const ENGINE_ID = "generation.promptCompilerEngine";
/** 1.2.0: the scene's canonical location and props (Locations & Props) and reference images for consistency. */
/** 1.3.0: a character's age in this scene (Scene DNA ages, Casting age states) and reference views at that age. */
/** 1.4.0: the character's gender as written in Casting, in the prompt and the package (AuraSketch draws from it). */
/** 1.5.0: each prop's state in this scene from the script's continuity (propContinuityEngine): "Laptop — broken". */
/** 2.0.0 (realism R1): every field that changes what is seen (PROMPT_FIELD_MAP.md); ranked blocks composed to each provider's limit; a video prompt with timed action, lip-synced dialogue in the character's accent, physicality, screen direction and neighbouring shots. */
export const ENGINE_VERSION = "2.0.0";
/** Deterministic compilation of approved upstream versions into a GenerationPackage. No AI calls. */
export const ENGINE_KIND = "deterministic" as const;
