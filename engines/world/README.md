# engines/world

Implemented:
- `worldExtractionEngine` 1.0.0 — canonical locations from scene headings (one per place: INT/EXT, times of day, sub-areas) and props / vehicles from action lines (named after a/the/his/her…, from a prop word list or written in CAPITALS; character names, locations and sound words are never props), each with the scene and source line as evidence. Deterministic.
- `worldLookEngine` 1.0.0 — one identity description per location / prop and a prompt per reference view (locations: establishing / wide / medium / detail at every time of day the script uses; props: hero / ¾ / detail / overhead / in hand), with an identity hash so views made from an older description are flagged. Runs in the browser and the API.

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `locationCanonicalizationEngine`
- `propStateEngine`
- `vehicleStateEngine`
- `worldContinuityEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.
