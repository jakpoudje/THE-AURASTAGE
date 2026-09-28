# Export & Deliver (frontend module)

## Purpose
The `/projects/[id]/export` workspace (UI reference §11): export presets, settings,
pre-delivery QC, render queue with live progress, exported deliverables with
per-file QC and checksums, preview, destinations.

## Canonical owner
apps/api/src/modules/rendering (RenderManifest / Deliverable); renders run in workers/render-worker.

## Behaviour
- Presets come from the versioned profile catalogue; formats that can't be made yet show the reason and can't be rendered.
- Only options a profile supports are editable (watermark / burned-in timecode on review copies).
- While anything is waiting or rendering the page re-reads the API every 3 s; progress is the worker's heartbeat.
- Downloads use signed links; the render manifest can be downloaded as JSON.
- Deliverables made from an older Picture Lock are shown "Out of date" with the reason; files are kept.

## Tests
`tests/e2e/delivery/run.cjs` (offline browser test; the mock runs the real render pipeline with ffmpeg).
