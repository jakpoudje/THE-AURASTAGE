# engines/scene-dna

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `sceneDNASynthesisEngine`
- `sceneContinuityValidatorEngine`
- `sceneReadinessEngine`
- `sceneBlockingEngine`
- `lightingIntentEngine`
- `soundIntentEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

Built: `sceneDnaFillEngine` v1.0.0 — built-in story intelligence (free): purpose, stakes, story time, mood, weather, atmosphere, lighting (motivated by the sources the action names), sound, camera energy and continuity notes from the scene's action, dialogue, neighbouring scenes and story setup, each with evidence.
