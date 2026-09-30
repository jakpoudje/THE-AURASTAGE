# Ask AuraStage (backend domain)

## Purpose
Turns a plain-language request made in any workspace into a proposal the user reviews before anything changes
(docs/architecture/INTELLIGENCE_PLAN.md §4). Canonical owner of `ai_proposals` only — it never owns production data.

## Flow
1. `POST /api/projects/:id/assistant` — validates the request, classifies the intent, builds the context (only the
   relevant objects, each with its canonical id and the version it was read at), freezes intent + context + planner
   prompt into the proposal and queues an `assistant.plan` job (`request_ai_proposal`, migration 0025).
2. Built-in requests are already planned (see below). For a paid writer, the generation worker (`workers/image-worker/src/planner.ts`, its own plan lane) plans it with the reasoning gateway
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

## Built-in story intelligence — free (owner, 2026-09-30)
"Only generation through a third party should cost money." Every request is planned by AuraStage's own engines unless
the person chooses a paid writer: `planner: "builtin"` (the default) or `"writer"` (Claude/OpenAI/Gemini, priced first
via `/estimate`, shown in the panel as "Refine with Claude").
- `builtin/index.ts` (planner 1.0.0, provider `aurastage`, model `story-intelligence-1.0.0`): one-click fills given as
  `task` — `develop_character`, `develop_cast`, `annotate_scene`, `fill_scene_overview`, `fill_visual_sound`,
  `fill_continuity`, `fill_scene`, `describe_world` — run `characterProfileEngine` (+ `wardrobeSuggestionEngine` for a
  first look), `dialoguePerformanceEngine`, `sceneDnaFillEngine` and `worldDescribeEngine` on evidence read with the
  user's own access (`builtin/evidence.ts`: the approved script's action lines, every scene and spoken line, Casting's
  introductions and story accents). They fill only EMPTY fields; gender is never guessed (only from the script's words).
  Anything else goes to the phrase planner (`builtin/phrases.ts`, moved from the test adapter).
- The API plans it inline (deterministic, milliseconds) and freezes the plan into the proposal (`snapshot.builtin_plan`,
  with the context's ids and versions but not its text); the worker's plan lane records it at once without calling any
  provider (`test_output = false`). Preview, permissions, staleness, apply, rollback and undo are exactly as below.
- A built-in plan may hold up to 250 calls (a whole cast or scene); a paid writer is asked for up to 40.

## Tools (`tools/index.ts`)
`updateStory` (projects service), `updateCharacter` (profile fields; never renames or approves), `changeWardrobe`
(look + the look worn in a scene; a created look is kept on undo), `modifyDialogue` (performance annotations; words
come from the approved script), `updateSceneDNA`, `modifyShot`, `updateLocationOrProp` (Locations & Props: name,
description, prop category, confirm — through the world module's own save with its revision; gated `scene_dna:edit`;
views made from the old description are flagged, never replaced).

`updateSettings` (Project Settings: format, visual style, deliverables, credit names, titles & credits — never the
spending section; through the settings module's save with the current revision, so each change is a new settings
version), `adjustAudioTrack` (a scene's track level, pan, mute, solo through Audio Studio; the mix then needs a fresh
measurement before approval), `setClipTransition` (a picture clip's dissolve / fade from black / fade to black
through Editorial's own edit against the timeline revision; a locked picture refuses it as it does by hand; the clip's
version is the timeline revision, so any other edit to the cut makes the suggestion stale), `updateAssetDetails` (a
file's name, category, description and tags through the Assets Library's save; never archives or replaces the file).

Planner 1.1.0: the tool schemas shown to the model carry their limits (lengths, ranges, allowed values); they are frozen
into the request (`snapshot.tool_schemas`) and the worker sends a plan that breaks one back to the model once with the
exact problems (e.g. an accent over 120 characters), before the API validates it as always.

Places and props are in the context only ranked below the cast unless the request is about them (or asked from one);
the cut's picture clips and the Assets Library are read only when the request is about them or asked from those pages.
After an apply or undo the panel announces `aura:applied`; Casting, Locations & Props, Project Settings (unless you have
unsaved edits there), Audio Studio, Editorial and the Assets Library re-read at once (askBus
`useAssistantChanges`), so the change shows without a manual reload.

## One pass over a scene (task 36)
In Dialogue Intelligence and Scene DNA the panel offers "Fill scene in one pass (free)" (task `fill_scene`): one request that proposes every
spoken line's intention, subtext, emotion and intensity (modifyDialogue per line) and the scene's DNA (updateSceneDNA)
as a single suggestion, reviewed and applied (or undone) together. The context gives a focus scene its action text from
the approved script, all its lines and shots and the characters who speak in it first (up to 60 items); a plan may hold
up to 40 calls. Empty fields are filled; what a writer already wrote is kept unless the request asks to change it.

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
