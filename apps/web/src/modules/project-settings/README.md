# Project Settings (frontend module)

## Purpose
`/projects/:id/settings` — production-wide choices every stage follows. Each save is a new version.

## Canonical owner
`ProjectSettings` — backend authority `apps/api/src/modules/settings` (see its README). Story fields are owned by
Scriptwriter and shown here as "Inherited" with a link back.

## Sections
1 Story & Creative Summary (read-only) · 2 Technical (frame shape, loudness standard, fixed pipeline facts with reasons) ·
3 Visual style (look, palette) · 4 AI providers & generation (defaults, monthly paid-take limit with this month's usage) ·
5 Delivery targets (required deliverables) · 6 Production details (credits written into rendered files).

## Flow
Edit → "Review changes" shows "What this changes" (from `POST …/settings/impact`) → "Save settings" (PUT with the
revision it was opened at). If someone else saved first the save is refused and the draft is kept; "Reload" shows theirs.
People without settings:edit see everything read-only.

## Tests
`tests/e2e/settings/run.cjs` (offline), live browser step in `tests/live/`.

## Known operational error codes
AURA-SET-400, AURA-SET-403, AURA-SET-404, AURA-SET-409; AURA-GEN-402 is shown in Visual Generation when the cap is reached.
