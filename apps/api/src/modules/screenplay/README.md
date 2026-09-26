# Scriptwriter (backend domain)

## Purpose
Canonical authority for Script / ScriptVersion / Scene (SRS §3, §5).

## Canonical owner
Script / ScriptVersion / Scene, plus the Scriptwriter-owned story fields on
Project (edited through `apps/api/src/modules/projects`).

## Inputs / reads
Project story setup (runtime, genre, type) for the runtime scope plan.

## Outputs / writes
- Immutable `script_versions` (typed elements + source text + parser version).
- `scripts.current_version_id` / `approved_version_id`.
- `scenes` derived from the approved version, each with `source_version_id`
  and `content_hash`.

## Upstream dependencies
Projects (the project must exist and the caller must be an org member).

## Downstream consumers
Casting (Phase 3, character candidates from `ScriptApproved`), Dialogue,
Scene DNA (Phase 5 reads `scenes` and `review_state`).

## Relevant engines
engines/story/** — `screenplayFormatEngine`, `sceneBoundaryEngine`,
`runtimeScopeEngine`. Pure derivation lives in `screenplay.derive.ts`.

## API endpoints
- `GET  /api/projects/:id/script` — script, latest version, version list, scenes, analysis
- `POST /api/projects/:id/script/versions` — `{source_text, base_version_id, note?}` → new version (409 if someone saved first)
- `POST /api/projects/:id/script/approve` — `{version_id}` → approve and derive scenes (idempotent)
- `GET  /api/projects/:id/scope-plan` — runtime ScopePlan (`?mean_scene_minutes=` override)

## Database objects
`scripts`, `script_versions`, `scenes`; functions `save_script_version`,
`approve_script_version` (packages/database/migrations/0004).

## Events emitted / consumed
Emits `ScriptVersionSaved`, `ScriptApproved` (audit_events, same transaction).

## Permissions
RLS `is_org_member` on every read; tables have no direct write policies; the
write functions re-check membership. `screenplay.permissions.ts` returns a
clean 403 first.

## Tests
`./tests` (derivation + route tests, `pnpm --filter @aurastage/api test`) and
`tests/integration/scriptwriter_db.sql` (database behaviour).

## Known operational error codes
AURA-SCR-002 invalid input · AURA-SCR-403 no access · AURA-SCR-404 script/version
not found · AURA-SCR-409 concurrent edit · AURA-SCR-500 unexpected.

## Not built yet
AI story development / outline / script generation (needs the Provider Gateway,
Phase 7 — `commands/GenerateScreenplay.ts` is still an empty stub), PDF
import, and the character-extraction job (Phase 3). Final Draft / Fountain
import runs in the browser via `engines/story/screenplayImportEngine` and is
saved through the normal versions endpoint.
