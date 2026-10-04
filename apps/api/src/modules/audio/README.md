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
today AuraStage's recorded sound library (`aurastage-recorded-sound`: public-domain / CC0 field recordings, laid out
by `recordedSoundEngine` 1.0.0, credited per recording — providers README) where installed, otherwise the built-in synthesiser (`aurastage-synth`, `proceduralAudioEngine` 1.0.0: native, free, placeholder
quality, every layer explained) and the built-in voice (`aurastage-voice`, espeak-ng, installed in the API and worker
images). A voice request speaks the dialogue line of the cue (or `line_id`) — the words come from the approved script —
in the speaker's Voice DNA (`voiceCastingEngine` 1.0.0: the Casting profile's gender, age, nationality and personality,
adjusted by the line's emotion and intensity from Dialogue Intelligence); the Voice DNA is kept in the request's
`params` (rule 10). The default voice backend is the natural voice (`aurastage-kokoro-voice`: Kokoro-82M, cast by gender, age band, accent
and measured register — providers README) where installed, then the neural voice (`aurastage-neural-voice`: Piper with VCTK / LibriTTS-R
voices, CC BY 4.0; the speaker is matched to the character's base Voice DNA by register MEASURED at image build time, so a
character keeps one speaker; the line's emotion sets pace and energy); the espeak voice is the labelled robotic fallback.
Where neither is installed, voice is refused with 412,
never faked. `request_audio_generation`
is gated `audio:generate`; the generation worker makes the WAV, stores it privately and the Assets domain registers it
(`app_private.register_generated_asset`) tagged `generated`, linked to the scene, with provenance (provider, model,
engine version, seed). Using it on a cue is the person's choice ("Use this" = the normal clip save), so nothing is
placed or replaced automatically (rule 11).

## Studio mixing (migration 0029)
Each track carries `fx` (the channel strip: high-pass, 3-band EQ, compressor, reverb/delay sends, volume automation) and
each session carries `mix` (department buses, shared reverb and delay, master gain and limiter), both validated against the
shared contract (`TrackFxSchema`, `SessionMixSchema`) and saved through `update_audio_track` / `update_audio_mix`
(`PUT /api/projects/:id/audio/scenes/:sceneId/mix` with the session `revision`; stale → 409). Any change bumps the
revision, so the loudness measurement goes stale and the mix must be measured again before approval; approved versions
snapshot the strips and the routing. `engines/audio/mixAssistEngine` 1.0.0 computes dialogue ducking automation and the
master correction for the loudness target.

## Tracks added by hand (migration 0031)
`POST /api/audio-sessions/:id/tracks` {name, family, after_track_id?} adds a track of any department (it routes to
that department's bus); `POST /api/audio-tracks/:id/move` {direction: -1|1}; `DELETE /api/audio-tracks/:id` removes a
track a person added, only when it holds no clips (AURA-AUD-409 otherwise; spotted tracks are muted instead). Names
are unique per scene (409). Re-spotting never removes tracks added by hand and (bug fix) keeps clips placed by hand.
All three are gated `audio:edit` and bump the session revision, so the mix must be measured again.

## Downstream consumers
Approved versions snapshot tracks with their channel strips and the session routing (`audio_session_versions.mix`).
Editorial playback and the render worker both use them: Editorial plays each scene through the Audio Studio's own
graph with that routing, and exports render through `studioMixRenderEngine` (parity-tested against the browser), so
what was approved is what is heard in the cut and in delivered files.
Editorial & Timeline (Phase 9) — approved `audio_session_versions` snapshots.

## Relevant engines
- `engines/audio/musicSuggestionEngine` 1.0.0 — each scene's suggested music (`music_suggestion` in the workspace): a style from the built-in library chosen from Scene DNA mood, then the dialogue's emotions, then the film's tone; key, tempo, level, placement, instruments from the setting/genre and why. Free. Spotting (1.2.0) names the Score cue after it so the built-in generator plays that style; a scene better without score gets no Score cue.
- `engines/audio/audioSpottingEngine` — tracks and cues from shots, lines and Scene DNA (evidence per cue). The service passes each line's script position (read from the approved script version) so sound cues land where the action happens. R4 (1.3.0): it also passes each shot's action and the place's Locations & Props description (read-only); after spotting, the scene's room (shared reverb) and the dialogue/background strips for it are written into the mixer **only where the mixer and those tracks are still at their defaults** — anything a person set is kept — and the spot response names the room and its reason (`space`).
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

## One click for the whole film (owner, 2026-10-02) — `audio.batch.ts`
`POST /api/projects/:id/audio/spot-all` (scenes with a usable approved plan and no session), `…/audio/generate-all`
(every spotted scene's planned cues, as `generate-cues`), `…/audio/place-generated` and
`…/audio/scenes/:sceneId/place-generated` (each planned cue gets its newest finished generated sound through the same
gated `save_audio_clip` as "Use this"; clips that already hold a recording are never touched; cues still being made are
counted, not waited for). The web mixer's fader, pan, mute and solo act on what is playing (`Player.setLive/setTrack`).

## ElevenLabs (realism R2, 2026-10-02)
`providers/audio/elevenlabs/elevenLabsAdapter.ts` — voices (accent from Casting → library accent, gender, age band; line
emotion/intensity → delivery), sound effects (≤ 30 s per cue) and music. Listed as "add a key to connect" until
`ELEVENLABS_API_KEY` is set on the API and the generation worker; then chosen per clip, never by default. Prices are not
quoted (ElevenLabs bills in plan credits) — the cost note links the price page.

## Muted clips (migration 0053, 2026-10-02)
`audio_clips.muted` — a clip a person has switched off without deleting it. `save_audio_clip` takes `muted` (and
`source` when a deleted clip is recreated by Undo). Muted clips are skipped by browser playback/measurement
(`mixEngine.buildGraph`) and by the render (`renderManifestEngine` 1.9.0, captions included), so the approved mix and
the film never contain them; unmuting brings the sound back unchanged.

