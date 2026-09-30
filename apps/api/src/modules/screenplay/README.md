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
not found · AURA-SCR-409 concurrent edit · AURA-SCR-412 writing needs an earlier step (story/outline) · AURA-SCR-429 too many
writing requests · AURA-SCR-500 unexpected.

## AuraScript (Phase 13-9, migration 0030)
`screenplay.writing.ts` queues AI writing jobs in `script_generations` (never inline, rule 8); the generation worker
runs them with `screenplay.writingJob.ts` through the reasoning gateway (rule 7), and every answer is checked by
`engines/story/scriptWritingEngine` before it is stored. Kinds: `develop_story` (logline, synopsis, characters with
name reasons, beats), `outline` (scene list; the writer can edit and save it as their own version), `write_script`
(written in batches of scenes with real progress; a failure keeps what was written and a retry only writes what's
missing), `rewrite_scene` (improve / expand / rephrase / condense / dialogue / new scene). Nothing is applied
automatically: "Apply to Project Setup" and "Open as a new draft version" create normal versions with a provenance
note, based on the version the job was derived from (rule 10; 409 if the script moved on). Approval stays a person's
job. `GET /script/continuity` runs `continuityCheckEngine` on any version. Without an Anthropic key the labelled test
writer (TEST OUTPUT) only arranges the brief, so the flow can be tested for free.

**One current story** (owner, 2026-09-29: character names must match on every page): the newest story the writer
applied to Project Setup or wrote/edited themselves (`POST /script/writing/story`, migration 0033), else the newest
finished development. Outline, script and scene rewrites use it; `develop_story` receives its characters (and
Casting's) — and, from storyDevelopment 1.2.0, people named in the logline (and named twice in the synopsis) — as names already decided, which the writer must keep (`keeps_names` check; a title like "Justice" does not make a different person; a missing one is asked for again once, by name) unless the
writer asks for new names. `apply-story` with no fields makes a proposal current without touching Project Setup.
Script jobs write 3 batches at a time and report the real current step in `progress.stage`; story and outline use a
lighter reasoning effort. An empty Claude credit balance is reported plainly (not retried).

Routes: `POST /api/projects/:id/script/writing/story`, `GET|POST /api/projects/:id/script/writing`, `POST /api/projects/:id/script/writing/outline`,
`GET /api/projects/:id/script/continuity`, `GET /api/script-writing/:id`, `POST /api/script-writing/:id/apply-story`,
`POST /api/script-writing/:id/open-draft`.

## Not built yet
PDF import. Final Draft / Fountain import runs in the browser via `engines/story/screenplayImportEngine` and is
saved through the normal versions endpoint.
