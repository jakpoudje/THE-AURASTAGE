# engines/generation

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `promptCompilerEngine`
- `generationPackageCompilerEngine`
- `takeComparisonEngine`
- `visualQCEngine`
- `repairTargetingEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.


## Built
- `promptCompilerEngine` v1.0.0 (deterministic): GenerationPackage from approved upstream versions, with provenance and evidence checks.

## costEstimateEngine (1.0.0)
What an action will cost before it runs (owner request 2026-09-30): images per image, video per second, AI writing per
million tokens (≈4 characters a token; a range of half to double the expected reply). Built-in generators are free.
Prices come only from `prices.ts` — published list prices with their source and date; unconfirmed ones are `null`
and the total becomes "at least". Used by Visual Generation, Casting looks (per character and whole cast), Locations
& Props views, AuraScript (story, outline, full script) and Ask AuraStage (priced from the exact prompt the planner
would receive, via `POST /api/projects/:id/assistant/estimate`, before anything is sent).
