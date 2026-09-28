# Ask AuraStage (web)

The assistant panel opened from the top bar of every workspace (AppShell). It sends a plain-language request to
`POST /api/projects/:id/assistant` with the current workspace, waits while the generation worker plans it, then shows
the proposal: each change as field-level before → after, whether your role may apply it, whether the object changed
since it was read, what may be flagged downstream, and what can't be done. **Apply** runs the changes through each
domain's own service; **Undo** puts the previous values back (refused if someone changed them again since).

Output from the built-in test planner (no AI key on the server) carries the **DEVELOPMENT / TEST OUTPUT** label.

Backend: `apps/api/src/modules/assistant`. Plan: `docs/architecture/INTELLIGENCE_PLAN.md`.
Tests: `tests/e2e/assistant/run.cjs`.
