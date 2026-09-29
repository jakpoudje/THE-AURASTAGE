# engines/editorial

Implemented (deterministic, versioned, typed):
- `assemblyTimelineEngine` v1.0.0 — first assembly from approved shot plans, takes and mixes.
- `editDecisionEngine` v1.0.0 — NLE operation semantics (sync-locked ripple).
- `editorialQCEngine` v1.0.0 — gaps, flash frames, offline media, stale sources, overlaps, A/V sync, runtime.
- `pictureLockEngine` v1.0.0 — impact analysis when a locked picture changes.
- `edlExportEngine` v1.0.0 — CMX 3600 EDL.
- `timeline.ts` — shared helpers (timecode, overlaps).

Planned (SRS §15): `dialogueDrivenEditEngine`, `pacingEditEngine`, `continuityEditEngine`, `transitionIntelligenceEngine`,
`colorMatchEngine`, `colorManagementEngine`, `vfxConformEngine`, `titleGraphicsEngine`, `subtitleTimelineEngine`.

Each engine has its own folder (see `_template/`) with `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `validator.ts`, `version.ts`, `tests/`.

- `timelineAutomationEngine` v1.0.0 — volume automation of the final assembly (level at a frame; draw, set, move, remove, dip, clear), shared by Editorial playback and the render worker.
