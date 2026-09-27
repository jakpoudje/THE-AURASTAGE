# Scene DNA (backend domain)

## Purpose
Canonical authority for SceneDNA (SRS §8): the versioned production blueprint
of one scene. It references — never redefines — upstream authorities and
records the exact upstream versions each locked blueprint was built from.

## Inputs / reads (read-only)
- Scriptwriter: approved script version (action text + source lines), `scenes`
- Casting: `characters` (merge-followed), `character_appearances`, `wardrobe_looks`
- Dialogue: `dialogue_lines` (emotion, intensity, approval, review state)

## Outputs / writes
`scene_dna` (editable fields, status, review_state, drift evidence) and
immutable `scene_dna_versions` (content + frozen dependency refs + engine version).

## Relevant engines / packages
- `engines/scene-dna/sceneDnaAssemblyEngine` — participants, dialogue summary,
  weather/atmosphere/sound detections with source lines, continuity notes,
  readiness predicates (blocking vs recommended).
- `packages/production-graph` — `computeDrift` / `descendantState`.

## API endpoints
- `GET   /api/projects/:id/scene-dna` — every active scene (plus cut scenes that carry work): record, editable fields, proposal, looks, summary counts. Also the MOS invalidation step: persists drift when it differs from what is stored.
- `PATCH /api/projects/:id/scene-dna/:sceneId` — partial `UpdateSceneDnaInput` (strict; unknown fields rejected). Editing reopens an approved record as draft; the locked version stays in history.
- `POST  /api/projects/:id/scene-dna/:sceneId/approve` — lock: 412 with the failing blocking predicates unless ready; otherwise freezes content + dependency refs as a new version.

## Versioning & invalidation (CLAUDE.md rules 10–11)
Dependency refs: the scene (`content_hash`, **hard**), each participant
character (profile fingerprint, soft), each active dialogue line (words +
annotations + approval, soft), each chosen wardrobe look (soft). After locking,
a hard change marks the record **stale**; soft changes, removals and newly
added participants/lines mark it **review_required**, with one evidence item
per change. Locking again creates the next version; nothing is deleted.

## Database objects
Migration 0011: `scene_dna`, `scene_dna_versions`, `save_scene_dna`,
`approve_scene_dna` (writes a completed MOS job), `set_scene_dna_drift`
(idempotent), internal guard `scene_dna_assert`.

## Events
`SceneDNAUpdated`, `SceneDNAApproved`, `UpstreamVersionChanged` (audit_events).

## Permissions
RLS `is_org_member` on both tables; every write function re-checks membership
and that the scene belongs to the project.

## Tests
`./tests/routes.test.ts`, `tests/integration/scene_dna_db.sql`, `tests/e2e/scene-dna`,
`engines/scene-dna/**/tests`, `packages/production-graph/src/index.test.ts`.

## Known operational error codes
AURA-SDNA-002 invalid input · 010 invalid engine input · 403 no access ·
404 scene not in project · 409 scene cut from the script · 412 not ready to lock
/ script not approved · 500 unexpected.

## Not built yet
"Generate / Enhance Scene DNA" with an AI model (needs the Provider Gateway,
Phase 7; `commands/GenerateSceneDna.ts` is still an empty stub), reference
frames (needs Assets ingest), props (no Props authority yet), CharacterState
per scene (injury/emotional state), version compare view.
