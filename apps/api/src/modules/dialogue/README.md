# Dialogue Intelligence (backend domain)

## Purpose
Canonical authority for DialogueLine (SRS §3, §7): the written/performance
meaning of each spoken line — intention, subtext, emotion, intensity, notes and
approval. The words themselves are owned by Scriptwriter; Audio Studio realises
lines sonically but never rewrites them.

## Inputs / reads
Approved script version + scenes (Scriptwriter, read-only); characters, aliases
and appearances (Casting, read-only) to resolve speakers and listeners.

## Outputs / writes
`dialogue_lines`, each stamped with `source_version_id`.

## Relevant engines
`engines/dialogue`: `dialogueExtractionEngine` (lines, timing, text hash),
`dialogueVoiceprintEngine` (per-character voice metrics, repeated phrasing),
`dialogueBalanceEngine` (per-scene share, long speeches, dominance).

## API endpoints
- `GET  /api/projects/:id/dialogue` — scenes, lines, sync state, analysis (voiceprints, balance, unresolved speakers, review count)
- `POST /api/projects/:id/dialogue/sync` — build/refresh lines from the approved script (412 until approved)
- `PATCH /api/dialogue-lines/:id` — `{intention?, subtext?, emotion?, intensity?, notes?, approval?, acknowledge_review?}`
- `POST /api/projects/:id/dialogue/scenes/:sceneId/approve` — approve all active lines in a scene

## Versioning & invalidation (CLAUDE.md rules 10–11)
Sync matches lines by the words spoken (per scene), then by speaker + position.
Unchanged lines keep annotations and approval; edited annotated/approved lines
become `review_required` with `previous_text`; vanished lines become `omitted`
(never deleted). Editing an approved line's annotations reopens it (draft).

## Database objects
Migration 0010: `dialogue_lines`, `sync_dialogue_lines`, `update_dialogue_line`,
`approve_scene_dialogue` (internal guard `dialogue_assert_member`).

## Events
`DialogueSynced`, `DialogueLineUpdated`, `DialogueLineApproved`, `SceneDialogueApproved`
(audit_events); each sync writes a completed MOS job.

## Tests
`./tests/routes.test.ts`, `tests/integration/dialogue_db.sql`, `tests/e2e/dialogue`.

## Known operational error codes
AURA-DLG-002 invalid input · 403 no access · 404 not found · 409 script changed /
line cut · 412 script not approved · 500 unexpected.

## Not built yet
AI suggestions for intent/subtext/emotion, exposition density, knowledge guard,
expand/condense/rewrite alternatives (need the Provider Gateway, Phase 7;
`commands/GenerateDialogue.ts` is still an empty stub); reaction/interruption
beats (with Scene DNA, Phase 5).
