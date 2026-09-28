# Dashboard (frontend module)

## Purpose
`/dashboard` — the studio's projects, "+ New Project", My tasks, and a **production overview** of the chosen project.

## Canonical owner
Composes across domains; owns no canonical object.

## Production overview
`GET /api/projects/:id/overview` (apps/api/src/modules/projects/projects.overview.ts, productionOverviewEngine 1.0.0).
Nine stage cards (Scriptwriter → Export & Deliver), each with a state (Complete / In progress / Needs review /
Not started / Waiting), a plain summary, a bar drawn only from real counts ("1 of 3 locked scenes have an approved
shot plan") and "Why?" — the checks and evidence behind it. A "Needs attention" list and the single next step link to
the right workspace. Project overview counts (scenes, shots, characters, locations, lines, assets) and Recent activity
(the audit trail). Nothing here is an estimated percentage (CLAUDE.md rule 12).

## Tests
`tests/e2e/dashboard/run.cjs`, `apps/api/src/modules/projects/tests/overview.test.ts`, live smoke + browser checks.
