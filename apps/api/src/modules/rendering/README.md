# Export & Deliver (backend domain)

## Purpose
Canonical authority for RenderManifest / Deliverable (SRS §12). Deliverables are
made only from the CURRENT Picture Lock, from an immutable, checksummed manifest.

## Canonical owner
`renders` (migration 0018). Files live in the private media bucket under
`<org>/<project>/renders/<render>/<file>`.

## Inputs / reads (read-only)
Editorial `timelines`, `picture_locks`, `timeline_versions` (the locked clips);
Visual Generation `takes` (storage keys); Audio Studio `audio_sessions`,
`audio_session_versions` (approved mix snapshots); Assets `assets` (recordings);
Dialogue `dialogue_lines` (subtitle text).

## Outputs / writes
Only through SECURITY DEFINER functions: `create_render` (re-checks the current
lock and that the manifest names it; queues a MOS `jobs` row), `cancel_render`,
`set_render_review`. The render worker uses token-authenticated
`worker_claim_render`, `worker_render_progress` (heartbeat + cancel flag),
`worker_complete_render`, `worker_fail_render` (anon role only; signed-in users
can't call them).

## Engines
`engines/rendering`: `deliveryProfileEngine` (versioned profiles; unavailable ones
say why), `renderManifestEngine` (gap-free picture, mixes with real recordings,
subtitles, EDL, exact source ids; refuses with reasons when a master file is
missing), `subtitleTimelineEngine`, `timelineAudioMixEngine`, `finalQCEngine`.

## API endpoints
- `GET  /api/projects/:id/delivery` — Picture Lock, profiles, pre-delivery checks, deliverables with signed download links, preview, queue, destinations
- `POST /api/projects/:id/delivery/renders` — `CreateRenderInput`; 412 without a current lock or with missing media
- `POST /api/renders/:id/cancel` — waiting: cancelled now; running: stops at the worker's next heartbeat
- `GET  /api/renders/:id/manifest` — the immutable manifest and its SHA-256

## Invalidation (rule 11)
When the Picture Lock a deliverable was made from is no longer current, the
deliverable is marked `stale` with the reason. Its files stay downloadable.

## Events emitted
`RenderRequested`, `RenderCancelRequested`, `RenderCompleted`, `RenderFailed`, `RenderCancelled`, `UpstreamVersionChanged`.

## Tests
`tests/routes.test.ts`, `tests/integration/delivery_db.sql`, `workers/render-worker/src/render.test.ts`, `tests/e2e/delivery/run.cjs`.

## Known operational error codes
AURA-EXP-002 invalid input · 400 manifest/lock mismatch · 403 · 404 · 409 can't cancel · 412 no lock / missing media / storage not set up · 500.

## Not built yet (tracked)
DCP, 4K HDR, MXF broadcast masters, social vertical reframes, localisation/dubbing,
delivery to YouTube/Vimeo/Frame.io/S3 (need account connections), multipart upload for files over 5 GB.
