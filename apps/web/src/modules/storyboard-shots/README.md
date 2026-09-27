# Storyboard & Shots (frontend module)

## Purpose
Storyboard workspace (docs/design/UI_REFERENCE.md §7): scene list with plan
status, storyboard grid of numbered frames (schematic framing guides, size
badge, duration, caption), shot list table, full shot-details editor, planning
tools, scene shot summary with coverage checks, and the scene shot timeline.

## Canonical owner
apps/api/src/modules/shots (canonical objects: Shot, ShotPlan)

## Reads / writes
Only through `api/storyboardApi.ts`. Plan shots / re-plan (asks before
replacing), add, edit, move, remove shots, approve the plan. Framing guides
are drawings, not generated images — real frames arrive with Visual Generation.

## Tests
`tests/e2e/storyboard/run.cjs` (offline, against `tests/e2e/scriptwriter/mock-api.cjs`).
