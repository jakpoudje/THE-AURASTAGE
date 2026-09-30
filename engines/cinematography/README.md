# engines/cinematography

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `shotPlanningEngine` — **built** (v1.1.1, deterministic): first coverage plan from a locked Scene DNA version (1.1.0 coverage styles; 1.1.1 long Scene DNA text is shortened at a sentence to fit a shot's 500-character fields instead of being refused)
- `coverageMathEngine` — **built** (v1.0.0): SRS §9.1 coverage of story time + mandatory dialogue beats
- `cameraRecommendationEngine`
- `storyboardFrameEngine`
- `animaticEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.
