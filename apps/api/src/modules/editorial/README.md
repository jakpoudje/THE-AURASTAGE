# Editorial & Timeline (backend domain)

## Purpose
Canonical authority for AssemblyTimeline / PictureLock (SRS §12). One timeline
per project: V1 picture cut from APPROVED takes, A1 the APPROVED scene mixes, V2 inserts (an approved take shown
over the picture while it lasts) and A2 music (an audio file from the Assets Library, its own level `gain_db`,
migration 0045). V2/A2 are layer tracks: placing a clip there never ripples, and they ride along with every ripple edit.

## Canonical owner
`timelines`, `timeline_clips`, `timeline_versions`, `picture_locks` (migration 0017).

## Inputs / reads (read-only)
Scriptwriter `scenes`; Storyboard `shot_plans` + `shot_plan_versions` (shot order and
story-time spans); Visual Generation `takes` (approved takes, media via signed links);
Audio Studio `audio_sessions` + `audio_session_versions` (approved mix snapshots).
Before reading, the service asks Audio Studio to refresh its review state
(`refreshAudioReview`, which refreshes Storyboard and Scene DNA first).

## Outputs / writes
Only through SECURITY DEFINER functions: `save_timeline` (atomic replace of the clip
list against the revision; references must belong to the project, takes must be
finished takes of their shot, mixes must be of their scene, music must be an audio asset of the project, no overlaps per track,
transitions only on V1),
`save_timeline_version`, `lock_picture`, `set_timeline_review`.

## Engines
- `assemblyTimelineEngine` — first assembly: per scene, cut to the most recently started shot covering each moment of story time; no approved take → offline slug; mix on A1 in sync.
- `editDecisionEngine` — insert, overwrite, trim (with/without ripple), roll, slip, slide, blade, lift, extract, move, grade, conform, gain (music level). Sources: take, insert_shot (V2), music (A2). Sync lock always on (1.2.0).
- `editorialQCEngine` — blocking: picture present, no offline media, sources current, no overlaps; recommended: flash frames, gaps, A/V sync per scene, scenes without sound, runtime vs target. Each with timecodes.
- `pictureLockEngine` — impact of changing a locked picture, per scene.
- `edlExportEngine` — CMX 3600 EDL.
- `timelineAutomationEngine` 1.0.0 — volume automation of the cut (points joined by straight lines in dB), and the
  edits a person makes: draw a stroke (thinned), set / move / remove a point, dip under a clip, clear a range.

## API endpoints
- `GET  /api/projects/:id/editorial` — timeline, clips, upstream issues, QC, versions, locks, media bin, `music_library` (the project's audio assets), signed media links, mix snapshots for playback
- `POST /api/projects/:id/editorial/assemble` — `{base_revision, break_lock?}`; keeps the current cut as a version first
- `POST /api/projects/:id/editorial/edit` — `EditRequest` (one NLE operation)
- `POST /api/projects/:id/editorial/versions` — `{label}`
- `POST /api/projects/:id/editorial/versions/:versionId/restore` — `{base_revision, break_lock?}`; keeps the current cut as a version first
- `POST /api/projects/:id/editorial/lock` — `{base_revision}`; 412 with the failing checks
- `GET  /api/projects/:id/editorial/edl` — text/plain EDL
- `PUT  /api/projects/:id/editorial/automation` — `{automation: {A1: [{frame, db}]}, base_revision}` (the automation
  revision, not the picture revision). Sound, not picture: allowed after Picture Lock and never breaks it. Versions keep
  a copy (restore brings it back); renders record the exact curve and `automation_revision` in their manifest.

## Screen
The page opens with the assembly overview: the finishing steps from the stored cut, its checks and its lock (Assemble →
Picture → Sound → Levels → Lock picture → Deliver) and one card per scene (shots, offline shots, its mix, length; click
to go there). The timeline shows a Scenes row, Picture (V1), Sound (A1) and the Volume lane; the "✎ Draw volume" tool
draws on it, other tools click to add / drag to move / double-click to remove points, and the Volume automation panel
sets a level at the playhead, dips under the selected clip or clears. Playback follows the curve frame by frame, as
the render does.

## Invalidation (rule 11)
A newer approved take/mix, an unapproved plan edit or a removed shot flags the timeline
`review_required` and lists the clips; the cut is never changed until someone runs
Conform (keeps every cut point, swaps sources). A locked picture refuses edits (423 with
the impact) until the break is confirmed; the break and its impact are recorded.

## Events emitted
`TimelineEdited`, `TimelineVersionSaved`, `PictureLocked`, `PictureLockBroken`, `UpstreamVersionChanged` (audit_events).

## Permissions
Project members read (RLS); editors write (checked inside every function).

## Tests
`tests/routes.test.ts`, `tests/integration/editorial_db.sql`, `tests/e2e/editorial/run.cjs`, engine tests in `engines/editorial/*/tests`.

## Known operational error codes
AURA-EDT-002 invalid input · 400 invalid reference/overlap · 403 · 404 · 409 timeline changed / edit not possible · 412 not ready · 423 picture locked (needs confirmation) · 500.

## Not built yet (tracked)
Subtitle tracks, multi-cam, colour scopes/curves (only a basic per-clip grade), VFX conform, AI-assisted assembly suggestions (needs the Provider Gateway).
