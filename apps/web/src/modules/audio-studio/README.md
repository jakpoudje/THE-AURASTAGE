# Audio Studio (frontend module)

## Purpose
The `/projects/[id]/audio` workspace: spot scenes, place recordings, mix, measure, approve and export.

## Canonical owner
apps/api/src/modules/audio (AudioSession / Mix). Recordings belong to Assets.

## What's on the page
- Scene tabs (✓ approved, ! needs review) and the review banner with the reason.
- Timeline: tracks with mute/solo, dashed "planned" cues, recordings with waveforms, drag to move, click to edit, playhead/zoom.
- Clip inspector: label, track, recording (choose or upload), start/length/offset, gain, fades.
- Mixer: pan, fader, mute/solo and live level meters per track, and a studio channel strip per track (high-pass filter,
  3-band EQ with its real frequency curve, compressor with live gain reduction, post-fader reverb/delay sends, volume
  automation with "Duck under dialogue"); department buses (DX/FX/BG/MX), a shared reverb (room/hall/plate) and delay,
  and a master with limiter and "Match loudness target". One Web Audio graph (state/mixEngine.ts) drives playback,
  BS.1770-4 measurement and WAV/stem export, so what you hear is what is measured and delivered.
- Loudness & delivery: measure the rendered mix (BS.1770-4), readiness checks with evidence, approve, WAV export of the full mix and DX/FX/BG/MX stems.
- Tools & generators: AI voice/music/SFX/clean-up shown as not connected (no key yet).

### Clip tools (owner request 2026-10-02)
Select a clip, then **✂ Split** at the playhead, **🔇 Mute clip / 🔈 Unmute clip** (a muted clip stays on the timeline,
striped, and is left out of playback, measurement, the approved mix and the film — migration 0053, renderManifest
1.9.0), **⇤ Trim start / Trim end ⇥** to the playhead, drag either edge of a clip to trim it, **◢ Fade in / Fade out ◣**,
**−3 dB / +3 dB**, **⧉ Duplicate**, **🗑 Delete**. **↶ Undo** (Ctrl/Cmd+Z) takes back the last 30 clip changes, a delete
included (the clip comes back with its sound, place and settings). Keys: Space play, S split, M mute, [ / ] trim,
D duplicate, Delete remove.

## State
`state/mixEngine.ts` builds one Web Audio graph used for playback, offline render,
measurement and export, so what is measured and exported is exactly what is heard.
Every change goes through the API and the screen reloads from it.

## API endpoints
See apps/api/src/modules/audio/README.md and apps/api/src/modules/assets/README.md.

## Tests
`tests/e2e/audio/run.cjs` (offline browser test with reload checks).
