export const ENGINE_ID = "audio.audioSpottingEngine";
/** 1.2.0: the score cue follows the scene's music suggestion (musicSuggestionEngine) when given. */
/** 1.3.0 (R4 sound realism): the scene's acoustic space (sceneAcousticsEngine) names the room tone and comes back as
 * dialogue/background strips; footsteps and doors timed to each shot's action, unless the script already spotted them there. */
export const ENGINE_VERSION = "1.3.0";
/** Deterministic spotting from approved upstream versions. No AI. */
export const ENGINE_KIND = "deterministic" as const;
