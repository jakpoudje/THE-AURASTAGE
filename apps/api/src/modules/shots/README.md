# Storyboard & Shots (backend domain)

## Purpose
Canonical authority for Shot and ShotPlan (SRS §9): translates a **locked**
Scene DNA version into cinematography (size, angle, movement, support, focus,
lens, duration, composition, lighting, transition, characters in frame,
dialogue covered, story-time interval). It never rewrites the scene.

## Inputs / reads (read-only)
Scriptwriter `scenes`; Scene DNA `scene_dna` + the approved `scene_dna_versions`
(participants, dialogue line ids, duration, camera energy, lighting intent);
Dialogue `dialogue_lines` (text, timing, intensity, listeners); Casting `characters` (names).

## Outputs / writes
`shot_plans` (one per scene, stamped with `scene_dna_version_id`), `shots`,
immutable `shot_plan_versions` (shots snapshot + coverage evidence).

## Relevant engines
`engines/cinematography/shotPlanningEngine` (first coverage proposal with a
rationale per shot) and `coverageMathEngine` (SRS §9.1: C = |∪ story intervals| / Tₛ,
dialogue lines as mandatory beats, readiness predicates).

## API endpoints
- `GET    /api/projects/:id/storyboard` — scenes with locked-DNA state, plan, shots, coverage; persists plan review state (MOS invalidation step)
- `POST   /api/projects/:id/storyboard/generate-all` — `{style?}`; one click for the film: plans every active scene whose Scene DNA is locked and current and that has **no** plan yet. Existing plans are never replaced; they (and unlocked scenes) come back in `skipped` with the reason
- `POST   /api/projects/:id/storyboard/scenes/:sceneId/generate` — `{replace?, style?}`; 412 until Scene DNA is locked and current; 409 if shots exist and `replace` is not set

Coverage styles (`CoverageStyleSchema`, shotPlanningEngine 1.1.0): `standard` (the 1.0.0 plan), `simple` (no reactions,
medium singles, camera on sticks), `intimate` (one size closer, shallow focus, reactions from intensity 5), `energetic`
(moving camera, push-ins from intensity 5, reactions from 6). Every style keeps full story-time and line coverage; each
shot's note starts with the style's name so the choice is visible in the plan.
- `POST   /api/projects/:id/storyboard/scenes/:sceneId/shots` — `{shot, after_ordinal?}`
- `POST   /api/projects/:id/storyboard/scenes/:sceneId/approve` — 412 with the failing coverage checks unless ready
- `PATCH  /api/shots/:id` — partial Shot DNA (strict)
- `POST   /api/shots/:id/move` — `{direction: -1 | 1}`
- `DELETE /api/shots/:id` — removes a working shot (approved snapshots keep it)

## Versioning & invalidation (CLAUDE.md rules 10–11)
Before reading Scene DNA state the service asks Scene DNA to refresh its own
review state (`refreshSceneDnaReview`), so a Casting/Dialogue/script change
propagates even if nobody opened Scene DNA since.
A plan is derived from one Scene DNA version. If Scene DNA is locked again the
plan becomes **stale**; if Scene DNA needs review (its own upstream changed) or
has unlocked edits, the plan becomes **review_required** with the reason.
Any shot edit reopens an approved plan as draft; approved versions stay in
`shot_plan_versions`. Re-planning replaces working shots only after the person
confirms.

## Database objects
Migration 0012: `shot_plans`, `shots`, `shot_plan_versions`; `generate_shot_plan`,
`add_shot`, `update_shot`, `delete_shot`, `move_shot`, `approve_shot_plan`,
`set_shot_plan_review`; internal `shots_assert`, `shots_insert_from_json`, `shots_touch_plan`.

## Events
`ShotPlanGenerated`, `ShotAdded`, `ShotUpdated`, `ShotMoved`, `ShotDeleted`,
`ShotPlanApproved`, `UpstreamVersionChanged` (audit_events); generate and approve write MOS jobs.

## Permissions
RLS `is_org_member` on all three tables; every write function re-checks membership
and that the scene belongs to the project.

## Tests
`./tests/routes.test.ts`, `tests/integration/shots_db.sql`, `tests/e2e/storyboard`,
`engines/cinematography/**/tests`, live checks in `tests/live`.

## Known operational error codes
AURA-SHOT-002 invalid input · 010/011 invalid engine input · 403 no access ·
404 not found · 409 shots exist (confirm replace) · 412 Scene DNA not locked /
changed, or coverage incomplete · 500 unexpected.

## Not built yet
AI camera recommendations and storyboard images (Provider Gateway + Visual
Generation, Phase 7; `commands/GenerateShots.ts` is still an empty stub),
animatic playback, blocking diagrams, 180° line checks.
