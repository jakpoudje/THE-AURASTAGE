# Scriptwriter (frontend module)

## Purpose
Frontend workspace for the Scriptwriter production stage
(docs/design/UI_REFERENCE.md §3). Route: `/projects/[id]/scriptwriter`.

## Canonical owner
apps/api/src/modules/screenplay (canonical object: Script / Scene)

## Steps
1 Project Setup (story fields + runtime) · 2 Story Development (AI, not yet) ·
3 Outline & Structure (runtime plan) · 4 Generate Script (AI, not yet) ·
5 Edit & Refine (editor, Final Draft/Fountain import, live preview + analysis, versions, approve) ·
6 Scene Breakdown · 7 Character Extraction.
Steps 2 and 4 say plainly that they need an AI writing service (Phase 7).

## Inputs / reads
`GET /api/projects/:id`, `GET /api/projects/:id/script`, `GET /api/projects/:id/scope-plan`.

## Outputs / writes
`PATCH /api/projects/:id` (story setup), `POST .../script/versions`, `POST .../script/approve`.

## Relevant engines
engines/story/** — run in the browser for live analysis (same deterministic
engines the API uses, so numbers match what gets saved).

## Structure
`page.tsx` (composition) · `hooks/useScriptwriter.ts` · `api/scriptwriterApi.ts`
· `components/*` · `types/`. Shared chrome: `src/components/AppShell.tsx`.

## Tests
`tests/e2e/scriptwriter` — offline browser test of the whole flow.
