# Ask AuraStage (backend domain)

## Purpose
Turns a plain-language request made in any workspace into a proposal the user reviews before anything changes
(docs/architecture/INTELLIGENCE_PLAN.md §4). Canonical owner of `ai_proposals` only — it never owns production data.

## Flow
1. `POST /api/projects/:id/assistant` — validates the request, classifies the intent, builds the context (only the
   relevant objects, each with its canonical id and the version it was read at), freezes intent + context + planner
   prompt into the proposal and queues an `assistant.plan` job (`request_ai_proposal`, migration 0025).
2. The generation worker (`workers/image-worker/src/planner.ts`) plans it with the reasoning gateway
   (`apps/api/src/providers/reasoning`): Claude when `ANTHROPIC_API_KEY` is set, otherwise the built-in test planner,
   whose output is stored with `test_output = true` and labelled DEVELOPMENT / TEST OUTPUT (rule 12).
   `AURA_TEST_PROVIDER=off` disables the test planner.
3. `GET /api/assistant/proposals/:id` — the plan validated against the Tool Registry, with each call's field-level
   before → after, the user's permission for it, whether the object changed since it was read (stale), and the
   downstream areas it may flag. Calls may only target objects that were in the context (no guessed ids).
4. `POST .../apply` — refuses on any not-allowed, invalid or stale call; otherwise runs each tool through the owning
   domain's service (so `gate_write`, versioning, audit and review flags apply as for a manual edit). A failure part
   way rolls back what already changed. Results keep the before values.
5. `POST .../undo` — puts the before values back, only while every field still reads what the change left (never
   overwrites newer work, rule 11). `POST .../reject` discards a proposal.

Also: `GET /api/projects/:id/assistant` (recent requests), `GET /api/assistant/capabilities` (planner, tools, media
providers — from configured keys, never guessed).

## Tools (`tools/index.ts`)
`updateStory` (projects service), `updateCharacter` (profile fields; never renames or approves), `changeWardrobe`
(look + the look worn in a scene; a created look is kept on undo), `modifyDialogue` (performance annotations; words
come from the approved script), `updateSceneDNA`, `modifyShot`.

## Permissions
Asking needs view access; each change is gated again when applied, as the signed-in user. Proposals are visible to
their author and to studio admins (RLS).

## Events emitted
`AIProposalRequested`, `AIProposalApplied`, `AIProposalRejected`, `AIProposalUndone`, `AIProposalFailed`.

## Tests
`tests/routes.test.ts`, `tests/integration/ai_db.sql`, `workers/image-worker/src/planner.test.ts`, `tests/e2e/assistant/run.cjs`.

## Error codes
AURA-AI-400 invalid request · 403 role can't make that change · 404 not found · 409 wrong state / changed since read /
changed since applied · 422 plan can't be applied · 429 too many requests in a minute · 500.
