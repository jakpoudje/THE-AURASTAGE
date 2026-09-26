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
