# Assets Library (backend domain)

## Purpose
Canonical authority for Asset / AssetVersion. Phase 8 adds audio recordings;
other asset types (reference images, documents) follow.

## Canonical owner
`assets` (created only through `register_asset`, migration 0015).

## Inputs / outputs
- Upload: raw audio body (WAV, MP3, OGG, FLAC, M4A/AAC — checked by magic bytes, max 50 MB).
  Bytes go to the private media bucket (`apps/api/src/storage/media.ts`), then
  the asset row is registered with name, media type, duration, sample rate, channels, size.
- Content: streamed back through the API to project members only.

## Downstream consumers
Audio Studio (clips reference `asset_id`); later Editorial, Export.

## API endpoints
- `POST /api/projects/:id/assets/audio?name=&duration=&sample_rate=&channels=` — body is the audio file (`Content-Type: audio/*`)
- `GET  /api/projects/:id/assets` — project assets
- `GET  /api/assets/:id/content` — the bytes (members only)

## Permissions
Upload requires project edit rights (checked in `register_asset`); reading requires membership (RLS).

## Tests
`tests/routes.test.ts`, `tests/integration/audio_db.sql`, `tests/e2e/audio/run.cjs`.

## Known operational error codes
AURA-AST-002 unsupported/oversized file · 403 · 404 · 412 media storage not configured · 500.

## Known gaps
Deleting an org/project does not yet remove its files from the bucket (tracked; a cleanup job is planned).
