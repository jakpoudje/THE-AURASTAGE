# engines/orchestration

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `readinessPredicateEngine`
- `invalidationImpactEngine`
- `jobSchedulingEngine`
- `providerRoutingEngine`
- `costEstimationEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.
