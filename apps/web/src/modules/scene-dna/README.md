# Scene DNA (frontend module)

## Purpose
Scene DNA workspace (docs/design/UI_REFERENCE.md §6): scene list with DNA
status, a tabbed editor (Scene Overview, Visual & Sound, Performance,
Continuity, Notes), readiness checklist with evidence and the Lock button,
and upstream-change evidence when a locked scene needs review.

## Canonical owner
apps/api/src/modules/scene-dna (canonical object: SceneDNA)

## Reads / writes
Only through `api/sceneDnaApi.ts` (GET workspace, PATCH save, POST approve).
Detections from the script are offered as "Found in the script" chips with
their source line and only applied on click. Unsaved edits are kept per scene
on this device (`state/sceneDraft.ts`) until saved or discarded.

## Tests
`tests/e2e/scene-dna/run.cjs` (offline, against `tests/e2e/scriptwriter/mock-api.cjs`).
