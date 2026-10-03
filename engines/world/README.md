# engines/world

Implemented:
- `worldExtractionEngine` 1.1.0 — canonical locations from scene headings (one per place: INT/EXT, times of day, sub-areas) and props / vehicles from action lines (named after a/the/his/her…, from a prop word list or written in CAPITALS; character names, locations and sound words are never props), each with the scene and source line as evidence. 1.1.0 (2026-10-03): people and titles written in capitals (a STEWARD, HON.), slogans/headlines (3+ capitalised words), text on signs, pages and screens or said aloud (quoted, after a colon, #hashtags, after "shouting"/"reads"), emphasis words and labels on objects ("the RETRY button") are not props; glasses (spectacles) are their own prop and window/door/table glass is not a drinking glass. Deterministic.
- `worldLookEngine` 1.0.0 — one identity description per location / prop and a prompt per reference view (locations: establishing / wide / medium / detail at every time of day the script uses; props: hero / ¾ / detail / overhead / in hand), with an identity hash so views made from an older description are flagged. Runs in the browser and the API.

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `locationCanonicalizationEngine`
- `propStateEngine`
- `vehicleStateEngine`
- `worldContinuityEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

Built: `worldDescribeEngine` v1.0.0 — built-in story intelligence (free): a location's or prop's description from the script's own words about it (look words, times, areas), set in the story's place and period.
- `propContinuityEngine` 1.1.0 — each prop's state scene by scene from its script lines (broken, bloodied, burnt, torn, missing; wet/open pass). 1.1.0 (2026-10-03): a state word must describe the prop (up to six words before it or three after, in the same clause — "a phone in a cracked case" is not a broken phone); an everyday item (in 4+ scenes) keeps a lasting state only within one place (`scene_locations`); one warning per state, listing its scenes.
