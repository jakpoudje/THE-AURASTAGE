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

## Editing (Edit…)
Images and audio can be edited in the browser from the asset panel; `engines/assets/assetEditEngine` (1.0.0) does the
maths. Images: crop (free or 16:9 / 2.39:1 / 1:1 / 9:16 / 4:5), rotate, flip, brightness / contrast / saturation, fit
to a size. Audio: trim, gain, fade in/out, peak normalise, with preview; saved as 16-bit WAV at the file's own sample
rate. Saving uploads the result through the normal Replace path as a NEW version with a note of exactly what was done
("Edited in AuraStage from v2: …"); earlier versions are never changed, and an edited recording on an approved mix
flags the mix for a new measurement like any replacement.
