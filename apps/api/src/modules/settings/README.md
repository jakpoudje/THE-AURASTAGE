# Project Settings (backend)

SRS Project Settings workspace. Error prefix `AURA-SET`. Canonical owner of `ProjectSettings` / `ProjectSettingsVersion`
(migration 0023). Story fields (title, genre, runtime, logline…) stay owned by Scriptwriter and are returned read-only.

## Endpoints
- `GET /api/projects/:id/settings` — current settings (defaults when nothing is saved), `revision`, `version_number`,
  the inherited story, the fixed pipeline facts with reasons, loudness standards, provider states, available delivery
  profiles, paid takes used this month and the version history.
- `POST /api/projects/:id/settings/impact { settings }` — what saving would change, counted from real rows
  (compiled prompts, approved mixes, paid takes). Writes nothing.
- `PUT /api/projects/:id/settings { base_revision, settings }` — saves a new version through `save_project_settings`
  (`gate_write(project,'settings','edit')`). A stale `base_revision` is refused with `AURA-SET-409` — never overwritten.

## Who reads the settings (`settings.read.ts`, read-only)
- Audio Studio: loudness standard → readiness target and label.
- Visual Generation: default frame shape and providers, paid-take budget; `style.look` goes into every compiled prompt
  (prompt compiler 1.1.0, "Style matched" check) and a look change marks compiled prompts review_required.
- `request_takes` (database): the monthly paid-take cap → `AURA-GEN-402` (API 412). AuraStage Sketch is never counted.
- Export & Deliver: loudness standard in delivery QC, required deliverables (non-blocking preflight check), credits
  written into rendered file metadata (renderManifest 1.1.0 `project.credits`, render worker `creditMetadata`).

Changes apply to new work only; approved work is never rewritten.

## Errors
`AURA-SET-400` invalid settings · `AURA-SET-403` no settings:edit · `AURA-SET-404` project not found · `AURA-SET-409` someone saved first.

Tests: `./tests/routes.test.ts`, `tests/integration/settings_db.sql`, `tests/e2e/settings/run.cjs`, live smoke/browser checks.
