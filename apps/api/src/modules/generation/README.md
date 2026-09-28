# Visual Generation (backend domain)

## Purpose
Canonical authority for GenerationPackage and Take (SRS §10). Turns each shot of
an **approved** shot plan into a structured, provider-neutral GenerationPackage,
queues Takes, and records explicit approval.

## Inputs / reads (read-only)
Project (title, genre, tone, setting, period); Scriptwriter `scenes` + approved
script version id; Storyboard `shot_plans` + immutable `shot_plan_versions`
(the approved shot snapshot); Scene DNA `scene_dna_versions` (purpose, mood,
weather, atmosphere, lighting, wardrobe choice); Casting `characters`,
`wardrobe_looks`; Dialogue `dialogue_lines`.

## Outputs / writes
`generation_packages` (content + exact provenance), `takes` (provider, model,
params, seed, status, approval, storage key, cost, request id). Media bytes live
in the private Railway bucket `aurastage-media`; members see them through
1-hour signed links (`apps/api/src/storage/media.ts`).

## Engines / gateway / worker
- `engines/generation/promptCompilerEngine` v1.0.0 (deterministic) builds the package + evidence checks.
- `apps/api/src/providers` — Provider Gateway (AuraStage Sketch, Runway, OpenAI). This module never calls a provider.
- `workers/image-worker` — claims takes (`worker_claim_take`), calls the gateway, stores media, completes/fails the take.

## API endpoints
- `GET  /api/projects/:id/visual` — approved shots, latest package, takes (signed media links), provider status (key present + last real result), queue counts
- `POST /api/projects/:id/visual/shots/:shotId/compile` — `{aspect_ratio?}`; 412 unless the shot plan is approved and current
- `POST /api/visual/packages/:id/takes` — `RequestTakeInput`; header `Idempotency-Key` optional; 412 when the provider isn't connected, storage isn't set up, the package is out of date, or video has no finished start frame
- `POST /api/takes/:id/approve | reject | reopen | cancel`

## Versioning & invalidation (CLAUDE.md rules 10–11)
Packages store the shot plan version and Scene DNA version they were compiled
from. Before reading, the service asks Storyboard to refresh its review state
(which refreshes Scene DNA). A package becomes **stale** when the plan is
approved again and **review_required** when the plan has unapproved edits or
needs review; new takes are refused until it is recompiled. Takes are never
deleted; approving one supersedes the previous approved take of that shot.

## Database objects
Migration 0013: `generation_packages`, `takes`, `worker_credentials`;
`create_generation_package`, `request_takes`, `set_take_approval`, `cancel_take`,
`set_package_review`; worker: `worker_claim_take`, `worker_complete_take`,
`worker_fail_take` (token-checked; granted to anon because the worker has no user
session); internal `generation_assert`, `worker_check`.

## Events
`GenerationPackageCompiled`, `TakesRequested`, `TakeGenerated`, `TakeFailed`,
`TakeApproved`, `TakeRejected`, `TakeReopened`, `UpstreamVersionChanged`.

## Tests
`./tests/routes.test.ts`, `apps/api/src/providers/tests`, `workers/image-worker/src/worker.test.ts`,
`tests/integration/generation_db.sql`, `tests/e2e/visual`, live checks in `tests/live`.

## Known operational error codes
AURA-GEN-002 invalid input · 010 compiler input · 401 worker not authorised ·
403 no access · 404 not found · 409 conflict (approve unfinished / cancel running) ·
412 not ready (plan not approved, provider not connected, storage missing, stale package) ·
502 provider error (recorded on the take) · 500 unexpected.

## Not built yet
Visual QC (identity/wardrobe/lighting checks on the result), targeted repair,
reference images from Assets, character-consistency references, cost estimates
before generating (providers don't return prices; we never guess).
