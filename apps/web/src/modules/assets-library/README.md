# Assets Library (frontend module)

## Purpose
`/projects/:id/assets` — "Your Production Assets. Organised. Searchable. Ready." (UI_REFERENCE §13).

## Canonical owner
Backend authority `apps/api/src/modules/assets` (see its README).

## What's here
Category tabs with counts (the 12 SRS categories), search + filters (type, usage, scene, archived, sort), a grid of asset
cards (type badge, version, specs, where it's used), and a detail panel: Overview (name, category, description, tags),
Usage (evidence + Add to Scene / link a character), Metadata (specs, SHA-256, history), Versions (every version,
downloadable). Actions: Upload, Download, Replace (adds a version), Archive/Restore, "Open in Visual Generation →" for
images. Comments (top right) are pinned to the selected asset and its version. The selected asset is in the URL
(`?asset=<id>`), so a reload or a shared link opens it again.

## Permissions
Upload needs assets:create; edits need assets:edit. Everyone on the project can browse and download.

## Tests
`tests/e2e/assets/run.cjs` (offline), live browser step in `tests/live/browser/run.mjs`.
