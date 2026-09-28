# Audio Studio (frontend module)

## Purpose
The `/projects/[id]/audio` workspace: spot scenes, place recordings, mix, measure, approve and export.

## Canonical owner
apps/api/src/modules/audio (AudioSession / Mix). Recordings belong to Assets.

## What's on the page
- Scene tabs (✓ approved, ! needs review) and the review banner with the reason.
- Timeline: tracks with mute/solo, dashed "planned" cues, recordings with waveforms, drag to move, click to edit, playhead/zoom.
- Clip inspector: label, track, recording (choose or upload), start/length/offset, gain, fades.
- Mixer: pan, fader, mute/solo and live level meters per track.
- Loudness & delivery: measure the rendered mix (BS.1770-4), readiness checks with evidence, approve, WAV export of the full mix and DX/FX/BG/MX stems.
- Tools & generators: AI voice/music/SFX/clean-up shown as not connected (no key yet).

## State
`state/mixEngine.ts` builds one Web Audio graph used for playback, offline render,
measurement and export, so what is measured and exported is exactly what is heard.
Every change goes through the API and the screen reloads from it.

## API endpoints
See apps/api/src/modules/audio/README.md and apps/api/src/modules/assets/README.md.

## Tests
`tests/e2e/audio/run.cjs` (offline browser test with reload checks).
