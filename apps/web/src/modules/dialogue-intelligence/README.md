# Dialogue Intelligence (frontend module)

## Purpose
Dialogue workspace (docs/design/UI_REFERENCE.md §5). Route: `/projects/[id]/dialogue`.

## Canonical owner
apps/api/src/modules/dialogue (DialogueLine).

## What it does
- Brings in every spoken line from the approved script (sync banner: never/current/stale).
- Scene list with status (Not started / In progress / Review / Approved) computed from the lines.
- Per line: speaker (Casting name), direction, timecode, listeners, intent (with suggestions),
  emotion, intensity, subtext, notes; Save / Approve / Reopen / Mark reviewed.
- "Approve scene dialogue" (Approval & Lock).
- Emotion arc (only annotated lines), Dialogue quality check (balance, long speeches,
  repeated phrasing, speakers not in Casting), Character voice & style.
- Script changes: edited annotated lines show their previous text; cut lines are kept aside.

## Structure
`page.tsx` · `hooks/useDialogue.ts` · `api/dialogueApi.ts` · `components/*` · `types/`.

## Tests
`tests/e2e/dialogue` (browser, offline stand-in API).
