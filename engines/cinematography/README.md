# engines/cinematography

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `shotPlanningEngine` — **built** (v1.2.0, deterministic): first coverage plan from a locked Scene DNA version (1.1.0 coverage styles; 1.1.1 long Scene DNA text is shortened at a sentence to fit a shot's 500-character fields instead of being refused; 1.2.0 every shot gets its composition — thirds, look room, foreground, axis — shaped by the mood)
- `coverageMathEngine` — **built** (v1.0.0): SRS §9.1 coverage of story time + mandatory dialogue beats
- `cameraRecommendationEngine`
- `storyboardFrameEngine`
- `animaticEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

## Camera intelligence (shotPlanningEngine 1.3.0, 2026-10-01)

`shotPlanningEngine/cameraGrammar.ts` runs after the coverage plan. Input `genre` (project genre — subgenre) picks a genre
family; `dna.purpose`, `dna.atmosphere`, `dna.mood` and the dialogue pick a scene kind (first strong cue wins: chase, fight,
reveal, grief, intimate, suspense, celebration, comic; otherwise talk). Genre rules then scene rules adjust only angle,
lens, focus, movement and support (comedy may widen a calm single to MS). Story intervals, lines and characters are never
changed, so coverage is identical. When the person chose the movement (a non-standard coverage style, or calm/frenetic
camera energy) only angle, lens and focus change. Every applied rule is appended to the shot's rationale ("Camera — …"),
and the output's `camera` lists the decisions. A drama talk scene is planned exactly as in 1.2.0.
