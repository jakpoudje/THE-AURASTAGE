# Production runs (MOS)

## Purpose
Whole-film work in Audio Studio and Visual Generation done in batches, scene by scene, with everyone on the project able
to see exactly what is happening (owner request 2026-10-02). A run is e.g. *spot → generate → place* for every scene, or
*compile → sketch → approve* for every shot.

## Canonical owner
`production_runs` (migration 0056) — only the record of the job (kind, step, status, message, log, who started it). The
work itself is written by each area's own permission-checked functions (`audio.batch`, `generation.batch`); per-scene
progress is read from those records by `GET /api/projects/:id/{audio|visual}/progress` (rule 12: counted, never estimated).

## How a run moves
- `POST /api/projects/:id/runs {kind, scene_id?}` starts one — or returns the one already running in that area
  (`joined: true`), so two people never run conflicting batches.
- `POST /api/runs/:id/step` does one round (~25 s budget, shared between the steps of a whole-film run) by whichever page
  holds the run's short lease; other pages just watch. A round that finds the generator's run queue full (migration 0055:
  48 sounds / 96 takes per project) waits and says so; people's own requests are always made first.
- A permission problem pauses the run with the reason; other problems are retried, and the run stops after three.
- `POST /api/runs/:id/control {pause|resume|stop}`; stopping keeps everything already made.
- A running run that no open page has carried on for 90 s shows as "waiting for an open page"; the next page continues it.

## Kinds
`audio.film` (spot → generate, placing finished sounds as it goes → finish), `audio.spot`, `audio.generate`, `audio.place`,
`visual.film` (compile, sketching ready shots as it goes → sketch & approve → finish), `visual.compile`, `visual.sketch`,
`visual.approve`.

## Errors
`AURA-RUN-400` bad kind/action · `AURA-RUN-403` no access · `AURA-RUN-404` run not found.

## Tests
`tests/runs.test.ts` (rounds, lease, pause/fail, visual film, validation); live smoke "production runs: …"; e2e audio and
visual suites ("▶ Do 1–3 for the whole film").
