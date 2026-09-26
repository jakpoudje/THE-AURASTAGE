# Casting & Characters (frontend module)

## Purpose
Casting workspace (docs/design/UI_REFERENCE.md §4). Route: `/projects/[id]/casting`.

## Canonical owner
apps/api/src/modules/characters (Character identity).

## What it does
- Finds characters in the approved script (sync banner shows never/current/stale from real sync records).
- Uncertain names go to "Needs your confirmation" — added only when a person confirms.
- Characters (N) list with role filters; profile with Profile, Personality & Backstory,
  Scenes & Continuity (script evidence with line numbers) and Names & Merges (aliases,
  merge duplicates, undo). Visual/Voice/Wardrobe tabs are marked Soon.
- Character Consistency checklist: every tick is a real check on stored data.

## Structure
`page.tsx` · `hooks/useCasting.ts` · `api/castingApi.ts` · `components/*` · `types/`.

## Tests
`tests/e2e/casting` (browser, offline stand-in API).
