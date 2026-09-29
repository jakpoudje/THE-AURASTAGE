# engines/audio

Implemented:
- `audioSpottingEngine` v1.1.0 — deterministic cue sheet (DX/VO per line, FX from Scene DNA sound candidates, BG ambience, score) with evidence per cue. 1.1.0: each FX/Foley cue is placed where its action line falls in the script, between the spoken lines around it (proportional to the script lines between them); without script positions cues are spread as in 1.0.0.
- `loudnessMeterEngine` v1.0.0 — ITU-R BS.1770-4 K-weighting (libebur128 coefficient derivation at any sample rate), gated integrated loudness, EBU Tech 3342 loudness range, 4× oversampled true peak.

Planned (SRS): `foleyRecommendationEngine`, `adrConformEngine`, `mixRoutingEngine`, `musicCueEngine`.

Each engine has its own folder (see `_template/`) with `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `validator.ts`, `version.ts`, `tests/`.

- `proceduralAudioEngine` 1.0.0 — AuraStage's built-in sound: deterministic synthesis of ambience (room tone, rain, wind, sea, traffic, birds, night insects, crowd, thunder), effects/Foley (footsteps, knocks, door slam, thunder, gunshot, glass, phone, engine, typing, paper, breath, impact) and score (key, mode and tempo from the mood). Lists every layer it used and why; peaks at −3 dBFS. Placeholder quality by design — never presented as a recording or AI.
- `voiceCastingEngine` 1.0.0 — Voice DNA: a character's voice (gender, age band, register, pace, loudness, English accent, built-in voice variant) from the Casting profile, stable per character, with every reason listed; a line's emotion and intensity adjust the delivery. Provider-neutral: the built-in voice uses the espeak parameters, paid voice providers will use the description. Runs in the browser (Casting → Voice DNA) and on the server (Audio Studio voice generation), so both agree.
- `mixAssistEngine` 1.0.0 — mixing assistants: volume automation that ducks music / ambience under the dialogue actually placed (lines closer than a second merged so the music doesn't pump), and the master gain change that moves the MEASURED integrated loudness onto the target, with the predicted true peak and whether the master limiter catches it.

- `studioMixRenderEngine` v1.0.0 — offline render of an approved Audio Studio mix with the browser's own chain
  (clip fades → fader + automation → high-pass → 3-band EQ → compressor → pan → DX/FX/BG/MX bus → master → limiter,
  post-fader sends to the shared reverb and delay). Follows the Web Audio specification and Chromium's
  DynamicsCompressorKernel, ConvolverNode normalisation and feedback-delay timing. `tests/e2e/audio-parity` renders the
  same mixes with the Audio Studio's own browser code in Chromium: every case matches to 46–137 dB below the signal.
  Used by the render worker, so exported films and stems sound like the approved mixes.
