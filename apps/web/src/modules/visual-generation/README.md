# Visual Generation (frontend module)

## Purpose
Visual Generation workspace (docs/design/UI_REFERENCE.md §8): shots of approved
shot plans with status, shot player with Previous/Next and takes V1..Vn, side-by-side
compare (shift-click), approve/reject, the auto-compiled prompt with evidence
badges, generation controls (Text→Image / Image→Video, provider, model, aspect
ratio, variations, duration, seed, starting frame) and provider status from the
server. Polls while takes are waiting or running.

## Canonical owner
apps/api/src/modules/generation (GenerationPackage, Take)

## Reads / writes
Only through `api/visualApi.ts`. No provider is called from the browser.

## Tests
`tests/e2e/visual/run.cjs` (offline, against `tests/e2e/scriptwriter/mock-api.cjs`).
