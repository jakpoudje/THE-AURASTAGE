# Editorial & Timeline (frontend module)

## Purpose
The `/projects/[id]/editorial` workspace: first assembly, NLE editing, grade preview, QC, versions, Picture Lock and EDL export.

## Canonical owner
apps/api/src/modules/editorial (AssemblyTimeline / PictureLock).

## What's on the page
- Media bin: approved shots (with their approved take) and approved scene mixes; Insert / Overwrite at the playhead.
- Viewer: the V1 frame under the playhead with the grade preview, timecode, fps.
- Timeline: V1 picture and A1 scene mixes; tools Select, Ripple, Roll, Slip, Slide, Blade; keyboard (Space, ←/→, B, Delete, Shift+Delete).
- Inspector: exact timecodes, frame-accurate trims/slip/slide, grade (exposure, contrast, saturation, temperature), lift/extract.
- Timeline checks with timecodes that jump to the problem; versions; Picture Lock and the break-lock confirmation with impact.

## State
Every gesture is one edit operation sent to the API (`engines/editorial/editDecisionEngine` runs on the server);
the page reloads from the API, so what you see is what is stored. Playback uses the audio clock: approved scene
mixes are rendered with the Audio Studio mix engine (`modules/audio-studio/state/mixEngine`, read-only reuse) and
picture follows.

## Tests
`tests/e2e/editorial/run.cjs` (offline browser test with reload checks).
