# ai-worker

Long reasoning, extraction, Scene DNA / shot planning jobs.

Runs via MOS (see engines/orchestration and apps/api/src/orchestration). Every job is
idempotent, checkpointed at safe boundaries, and emits telemetry per docs/architecture/MODULE_REGISTRY.md.
