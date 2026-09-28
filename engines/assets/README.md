# engines/assets

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `assetSimilarityEngine`
- `assetLineageEngine`
- `assetDerivativeEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

- `assetEditEngine` 1.0.0 — deterministic maths for editing uploaded files (audio trim/gain/fades/normalise and WAV encoding; image crop/rotate/flip/colour/resize plan) and the plain-language note saved with the new version.
