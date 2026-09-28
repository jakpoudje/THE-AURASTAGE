# Help & Support + account security (backend)

SRS §13.4 (Help & Support), §18 (security), §20 (status from telemetry). Error prefix `AURA-HLP`.

## What it does
- **System status** `GET /api/help/status` — every line carries its evidence: the API answering, a timed database
  query, media bucket configuration, each worker's last check-in (`worker_credentials.last_seen_at`, written by
  `worker_check` at most every 30 s; "Not responding" after 120 s) and the last 24 h of MOS job outcomes (a worker is
  "Degraded" when more than half of ≥3 finished jobs failed). Providers are "Connected" only when their key is on the server.
  Nothing is hardcoded green.
- **Guides** `GET /api/help/guides` — the written knowledge base in `engines/help/knowledge.ts`.
- **AuraStage Assistant** `POST /api/help/assistant { question, project_id?, module? }` — `knowledgeRetrievalEngine`
  over the guides plus, for a project the person can open, `supportDiagnosticEngine` findings (counts and error codes
  only). It explains and links; it never changes anything and reads only with the person's own access. It says plainly
  that no AI model is connected yet.
- **Diagnostics** `GET /api/projects/:id/diagnostics` — failed/stuck jobs, items marked for review, script/picture state.
- **Support tickets** `GET|POST /api/help/tickets`, `POST /api/help/tickets/:id/reply|close` — diagnostics are rebuilt on
  the server and kept only with consent; people see only their own tickets; platform staff (rows in `platform_staff`)
  see everyone's with `?all=1` and their replies mark a ticket answered. At most 10 new tickets per person per hour.
- **Sessions** `GET /api/account/sessions`, `POST /api/account/sessions/revoke { session_id|null }` — where you're signed in;
  sign one or all other devices out (the current session is always kept).

Cross-cutting hardening lives in `apps/api/src/infrastructure/rateLimit.ts`: per-person limits (600 reads, 120 writes a
minute → `AURA-MOS-429` with Retry-After) and nosniff / no-referrer / DENY framing / no-store headers.

Database: migration 0022 (`platform_status`, `is_platform_staff`, `create_ticket`, `reply_ticket`, `close_ticket`,
`list_tickets`, `my_sessions`, `revoke_sessions`; tables `platform_staff`, `support_tickets`, `ticket_messages`).
Tests: `./tests/routes.test.ts`, `tests/integration/help_db.sql`, `tests/e2e/help/run.cjs`, live smoke/browser checks.
