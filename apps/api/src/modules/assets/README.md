# Assets Library (backend domain)

## Purpose
Canonical authority for Asset / AssetVersion / AssetLink (SRS §13.3). Every file is stored once in the private
media bucket, fingerprinted (SHA-256) and versioned; other domains reference asset ids and read them read-only.

## Canonical owner
`assets`, `asset_versions`, `asset_links` — written only through `register_asset` (0015) and `update_asset`,
`add_asset_version`, `set_asset_link` (0024), all behind `gate_write(project, 'assets', …)`. Version 1 is written by a
trigger for every new asset.

## Rules
- **Replace never overwrites.** A new file gets a new storage key and a new version; earlier versions stay downloadable.
  Queued renders already froze the storage key they use (RenderManifest), so deliverables keep the file they were made from.
- **Approved work is flagged, not changed (rule 11).** When a recording on an approved Audio Studio mix is replaced, the
  mix is marked review_required with the reason; approval waits for a fresh loudness measurement (checked in the API
  readiness and again in the `approve_audio_session` database wrapper).
- **Usage is evidence, not a guess:** Audio Studio clips, the Editorial music track (A2, kind `timeline`), render manifests (`sources.asset_ids`) and links people made.
- **Search is honest:** `assetCatalogEngine` (engines/assets, 1.0.0) matches names, descriptions, tags and categories.
  Searching inside images/audio (vector/multimodal) isn't built yet and the page says so.

## API endpoints
- `GET  /api/projects/:id/library?q=&category=&type=&usage=any|used|unused&scene_id=&archived=1&sort=newest|name`
- `POST /api/projects/:id/library?name=&category=&width=&height=&duration=` — body is the file (image PNG/JPEG/WebP/GIF,
  video MP4/MOV/WebM, audio, PDF, text/CSV, .cube LUT; checked by content, ≤ 50 MB)
- `GET  /api/assets/:id` — detail with versions, usage, links and history
- `PATCH /api/assets/:id { name?, category?, description?, tags?, archived? }`
- `POST /api/assets/:id/versions?note=` — Replace (same kind of file; identical file → 409; archived → 409)
- `POST /api/assets/:id/links { object_type: scene|character, object_id, linked }`
- `GET  /api/assets/:id/content[?version=N][&download=1]` — the bytes (members only)
- Unchanged for Audio Studio: `POST /api/projects/:id/assets/audio`, `GET /api/projects/:id/assets?type=audio`

## Permissions
Adding needs assets:create, changing needs assets:edit (owners, admins, producers, or a grant); everyone on the project
can browse and download (RLS).

## Tests
`tests/routes.test.ts`, `tests/library.test.ts`, `tests/integration/assets_db.sql`, `tests/integration/audio_db.sql`,
`tests/e2e/assets/run.cjs`, live smoke + browser checks. Audio regression: `apps/api/src/modules/audio/tests/routes.test.ts`.

## Known operational error codes
AURA-AST-002/400 unsupported, mismatched or oversized file · AURA-COL-403 no access · AURA-AST-404 · AURA-AST-409
identical file / archived · AURA-AST-412 media storage not configured · AURA-AST-500.

## Known gaps
Thumbnails/proxies are not generated (images are previewed from the file itself); no vector/multimodal search; rights
metadata fields are not modelled yet; deleting an org/project does not yet remove its files from the bucket.

## Deleting an asset (migration 0043, owner request 2026-09-30)
`POST /api/assets/:id/delete {confirm?}` → `delete_asset` (gate `assets:edit`, audited `AssetDeleted`).
- A recording placed on Audio Studio clips is refused (409) with the scenes named — remove it from those clips first, or archive it.
- Any other use (links to scenes/characters/places, reference views in Casting or Locations & Props, deliverables already
  made) needs `confirm: true`; the detail view lists exactly where it is used first (`usage`, which now includes
  `reference` views). Reference views then count as missing and can be made again; delivered files keep their own copy.
- Every version's file is then removed from the private bucket; any file that couldn't be removed is reported (`files_left`).

## Video edits (migration 0050, BUILD_PLAN §8 item 34)

`POST /api/assets/:id/video-edit` `{ trim_start, trim_end|null, mute, speed (0.5–2), note }` → `request_video_edit`
(gate `assets:edit`; video only; one edit at a time per asset). The render worker claims it
(`worker_claim_video_edit`), cuts the version it was made from with ffmpeg (H.264/AAC, faststart) and records the result
as a NEW asset version (`worker_complete_video_edit`); earlier versions are kept. `GET /api/assets/:id` returns
`video_edits` (newest first) so the page shows progress and results.
