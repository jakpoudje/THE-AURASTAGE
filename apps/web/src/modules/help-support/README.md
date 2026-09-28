# Help & Support (web)

Routes: `/help` (opened from a workspace as `/help?project=<id>&module=<module>`) and `/account`.

- Guides for every workspace with search, and troubleshooting for the error codes the app shows.
- System and provider status exactly as the server measured it, with the evidence on each line.
- AuraStage Assistant: answers from the guides and the current project's status; links straight to the workspace.
- Support tickets: optional diagnostics (previewed before sending), replies, close.
- Account & security: devices you're signed in on, sign out others, change password.

Backend: `apps/api/src/modules/help`. Tests: `tests/e2e/help/run.cjs`.
