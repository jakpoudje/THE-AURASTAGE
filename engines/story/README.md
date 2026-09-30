# engines/story

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `narrativeBrainEngine`
- `storyIntelligenceMasterEngine`
- `actStructureEngine`
- `sequenceArchitectureEngine`
- `beatArchitectureEngine`
- `conflictArchitectureEngine`
- `themeCoherenceEngine`
- `subplotArchitectureEngine`
- `pacingArchitectureEngine`
- `openingStrategyEngine`
- `endingStrategyEngine`
- `screenplayFormatEngine`
- `screenplayIntelligenceOrchestrator`
- `generateFullScreenplay`
- `sceneBoundaryEngine`
- `storyFactExtractionEngine`
- `runtimeScopeEngine`
- `narrativeContinuityEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

Built so far (besides the format/import/boundary/runtime engines): `storyDevelopmentEngine`, `scriptWritingEngine`
1.0.0 (outline, batch scene writing and scene rewrite prompts + deterministic checks: scene count and order,
runtime, headings match the outline, characters named in the story bible, no invented speakers) and
`continuityCheckEngine` 1.0.0 (speaks before being introduced, near-identical names, INT/EXT switch of one place,
CONTINUOUS after a time jump, scenes with no action, orphan dialogue, very long speeches).

Built: `storySetupEngine` v1.0.0 — built-in story intelligence (free): genre, tone, setting, time period and a logline from the approved script (and the lead's motivation), plus the film's settings — look, palette, country, year, title-card line. Never invents credit names.
