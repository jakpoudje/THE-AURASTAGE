# Audio Studio (backend domain)

## Purpose
Canonical authority for AudioSession / Mix (SRS §11). One session per scene,
spotted from the scene's **approved** shot plan version; people place real
recordings on the cues, mix, measure the rendered mix and approve it.

## Canonical owner
`audio_sessions`, `audio_tracks`, `audio_clips`, `audio_measurements`, `audio_session_versions`.

## Inputs / reads (read-only)
Scriptwriter `scenes`; Storyboard `shot_plans` + `shot_plan_versions` (shot timing,
dialogue lines per shot); Scene DNA `scene_dna_versions` (sound intent, weather,
atmosphere, mood, sound candidates, dialogue line ids); Dialogue `dialogue_lines`;
Casting `characters`; Assets `assets` (type `audio`).

## Outputs / writes
Only through SECURITY DEFINER functions (migration 0015): `spot_audio_session`,
`update_audio_track`, `save_audio_clip`, `delete_audio_clip`,
`record_audio_measurement`, `approve_audio_session`, `set_audio_review`.
Every edit bumps the session `revision` and drops approval to draft; a
measurement is only accepted for the current revision (409 otherwise), so a
loudness number always belongs to the exact mix that was saved.

## Upstream dependencies / invalidation
Before reading, the service calls Storyboard's `refreshShotPlanReview` (which
refreshes Scene DNA first). If the plan was approved again the session becomes
`stale`; unapproved plan edits make it `review_required`. Re-spotting replaces
planned cues only — recordings and hand-added clips are kept (rule 11), and a
dialogue line that already has a recording is not given a new cue.

If a recording on an approved mix is replaced in the Assets Library (a new asset
version, migration 0024), the mix becomes `review_required` with the recording's name
and new version, and the "Loudness measured after the last change" check fails until
the mix is measured again. Approval then goes through as normal (the database wrapper
of `approve_audio_session` checks the same rule).

## Downstream consumers
Editorial & Timeline (Phase 9) — approved `audio_session_versions` snapshots.

## Relevant engines
- `engines/audio/audioSpottingEngine` — tracks and cues from shots, lines and Scene DNA (evidence per cue).
- `engines/audio/loudnessMeterEngine` — ITU-R BS.1770-4 / EBU R128 (integrated, true peak, LRA). Runs in the browser on the rendered mix.

## API endpoints
- `GET  /api/projects/:id/audio` — scenes with approved plans, session, tracks, clips, latest measurement, readiness predicates, recordings, generator status (all `not_connected`)
- `POST /api/projects/:id/audio/scenes/:sceneId/spot` — 412 unless the shot plan is approved and current
- `POST /api/projects/:id/audio/scenes/:sceneId/approve` — 412 with the failing blocking predicates
- `PATCH /api/audio-tracks/:id` — `UpdateAudioTrackInput`
- `POST /api/audio-sessions/:id/clips`, `PATCH|DELETE /api/audio-clips/:id` — `SaveAudioClipInput`
- `POST /api/audio-sessions/:id/measurements` — `LoudnessMeasurementInput`

## Readiness (rule 12)
Blocking: real audio present; every dialogue cue recorded; measured after the last change.
Recommended: −23 LUFS ±1, true peak ≤ −1 dBTP, planned FX/BG/MX cues filled. Each with evidence.

## Events emitted
`AudioSessionSpotted`, `AudioTrackUpdated`, `AudioClipSaved`, `AudioClipDeleted`,
`AudioMixMeasured`, `AudioSessionApproved`, `UpstreamVersionChanged` (audit_events).

## Permissions
Project members read (RLS); editors write (checked inside every function).

## Tests
`tests/routes.test.ts`, `tests/integration/audio_db.sql`, `tests/e2e/audio/run.cjs`.

## Known operational error codes
AURA-AUD-002 invalid input · 403 no access · 404 not found · 409 mix changed while measuring · 412 not ready (plan not approved, readiness failing) · 500.
