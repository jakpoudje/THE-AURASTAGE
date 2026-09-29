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

## Generating sound (migration 0026)
`audio.generation.ts`: generate a sound for a planned cue (`POST .../scenes/:sceneId/generate`) or for every planned
ambience / effect / Foley / score cue of a scene that has no recording and no generation yet (`.../generate-cues`).
Only backends from the Provider Gateway's audio side that can make that kind of sound AND are configured are used —
today AuraStage's built-in synthesiser (`aurastage-synth`, `proceduralAudioEngine` 1.0.0: native, free, placeholder
quality, every layer explained) and the built-in voice (`aurastage-voice`, espeak-ng, installed in the API and worker
images). A voice request speaks the dialogue line of the cue (or `line_id`) — the words come from the approved script —
in the speaker's Voice DNA (`voiceCastingEngine` 1.0.0: the Casting profile's gender, age, nationality and personality,
adjusted by the line's emotion and intensity from Dialogue Intelligence); the Voice DNA is kept in the request's
`params` (rule 10). The default voice backend is the neural voice (`aurastage-neural-voice`: Piper with VCTK / LibriTTS-R
voices, CC BY 4.0; the speaker is matched to the character's base Voice DNA by register MEASURED at image build time, so a
character keeps one speaker; the line's emotion sets pace and energy); the espeak voice is the labelled robotic fallback.
Where neither is installed, voice is refused with 412,
never faked. `request_audio_generation`
is gated `audio:generate`; the generation worker makes the WAV, stores it privately and the Assets domain registers it
(`app_private.register_generated_asset`) tagged `generated`, linked to the scene, with provenance (provider, model,
engine version, seed). Using it on a cue is the person's choice ("Use this" = the normal clip save), so nothing is
placed or replaced automatically (rule 11).

## Downstream consumers
Editorial & Timeline (Phase 9) — approved `audio_session_versions` snapshots.

## Relevant engines
- `engines/audio/audioSpottingEngine` — tracks and cues from shots, lines and Scene DNA (evidence per cue).
- `engines/audio/loudnessMeterEngine` — ITU-R BS.1770-4 / EBU R128 (integrated, true peak, LRA). Runs in the browser on the rendered mix.
- `engines/audio/proceduralAudioEngine` — the built-in synthesiser's layer plan.
- `engines/audio/voiceCastingEngine` — Voice DNA per character and line (also shown in Casting → Voice DNA).

## API endpoints
- `GET  /api/projects/:id/audio` — scenes with approved plans, session, tracks, clips, latest measurement, readiness predicates, recordings, generators from evidence (built-in sound and voice where installed; clean-up not built yet), and each scene's generations
- `POST /api/projects/:id/audio/scenes/:sceneId/spot` — 412 unless the shot plan is approved and current
- `POST /api/projects/:id/audio/scenes/:sceneId/approve` — 412 with the failing blocking predicates
- `POST /api/projects/:id/audio/scenes/:sceneId/generate` — `{ clip_id?, line_id?, kind, description, duration_seconds, provider?, seed? }` (voice: no description — the line is spoken; 400 without a line); 412 when no backend can make it
- `POST /api/projects/:id/audio/scenes/:sceneId/generate-cues` — `{ requested, skipped }`
- `PATCH /api/audio-tracks/:id` — `UpdateAudioTrackInput`
- `POST /api/audio-sessions/:id/clips`, `PATCH|DELETE /api/audio-clips/:id` — `SaveAudioClipInput`
- `POST /api/audio-sessions/:id/measurements` — `LoudnessMeasurementInput`

## Readiness (rule 12)
Blocking: real audio present; every dialogue cue recorded; measured after the last change.
Recommended: −23 LUFS ±1, true peak ≤ −1 dBTP, planned FX/BG/MX cues filled. Each with evidence.

## Events emitted
`AudioSessionSpotted`, `AudioTrackUpdated`, `AudioClipSaved`, `AudioClipDeleted`,
`AudioMixMeasured`, `AudioSessionApproved`, `UpstreamVersionChanged`, `AudioGenerationRequested`, `AudioGenerated` (audit_events).

## Permissions
Project members read (RLS); editors write (checked inside every function).

## Tests
`tests/routes.test.ts`, `tests/generation.test.ts`, `tests/integration/audio_db.sql`, `tests/integration/audio_gen_db.sql`, `tests/e2e/audio/run.cjs`.

## Known operational error codes
AURA-AUD-002 invalid input · 429 too many generations in a minute · 403 no access · 404 not found · 409 mix changed while measuring · 412 not ready (plan not approved, readiness failing) · 500.
