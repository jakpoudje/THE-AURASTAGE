# Projects (backend domain)

## Purpose
Horizontal backend domain: Projects.

## Canonical owner
N/A — coordinates across domains without owning a canonical object.

## Inputs / reads
Projects and organisations it owns. `GET /api/projects/:id/overview` (projects.overview.ts) reads every stage's
own read model (screenplay, characters, dialogue, scene-dna, shots, generation, audio, editorial, rendering — in
pipeline order, so each refreshes its review state) plus the asset count, and hands the counts to
`productionOverviewEngine` (engines/orchestration). It writes nothing and never estimates.

## Outputs / writes
TODO

## Upstream dependencies
TODO

## Downstream consumers
TODO

## Relevant engines
N/A

## API endpoints
TODO

## Database objects
TODO

## Events emitted / consumed
TODO

## Permissions
TODO

## Tests
See ./tests

## Known operational error codes
TODO

## Generation readiness
`GET /api/projects/:id/generation-readiness` (`projects.generation.ts`) — read-only. Backends from the Provider Gateway (configured or not, never guessed) plus each domain's own records of what was made in this project (ai_proposals, takes, character_reference_images, audio_generations, renders) → `generationReadinessEngine` 1.0.0: `proven` (configured + a real success here), `ready`, `needs_key` (names the exact variable), `not_built`. Test output alone never counts as ready.
