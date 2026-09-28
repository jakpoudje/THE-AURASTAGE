# engines/audio

Implemented:
- `audioSpottingEngine` v1.0.0 — deterministic cue sheet (DX/VO per line, FX from Scene DNA sound candidates, BG ambience, score) with evidence per cue.
- `loudnessMeterEngine` v1.0.0 — ITU-R BS.1770-4 K-weighting (libebur128 coefficient derivation at any sample rate), gated integrated loudness, EBU Tech 3342 loudness range, 4× oversampled true peak.

Planned (SRS): `foleyRecommendationEngine`, `adrConformEngine`, `mixRoutingEngine`, `musicCueEngine`.

Each engine has its own folder (see `_template/`) with `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `validator.ts`, `version.ts`, `tests/`.
