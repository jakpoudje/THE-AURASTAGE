# @aurastage/database

Canonical PostgreSQL schema (Supabase-hosted) + migrations + a thin typed client
factory. This package is the *only* place table/RLS definitions live — no other
module writes DDL.

## Migrations

`migrations/*.sql`, applied in filename order. These are the exact statements
already applied to the live `aurastage` Supabase project (ref `wczporjnmgdqmxqxvbhm`,
eu-west-2) via the Supabase MCP `apply_migration` tool. To apply them to a new
environment (e.g. a preview branch), run them in order through the Supabase
SQL editor, the `supabase` CLI, or the MCP tool.

- `0001_phase1_foundation.sql` — organizations, org_members, projects,
  audit_events, jobs, assets; RLS policies scoped to org membership via the
  `is_org_member()` helper; `create_organization()` atomically creates an org
  + owner membership.
- `0002_phase1_security_hardening.sql` — pins `search_path` on trigger
  functions and restricts RPC execution to `authenticated` (Supabase advisor
  findings).
- `0003_phase1_project_audit_trigger.sql` — writes an `audit_events` row on
  every Project insert/update/delete (SRS §2.2 event model; simplified outbox
  for Phase 1, replaced by a full transactional outbox once MOS/workers land).

## Client

`src/client.ts` exports `createSupabaseClient(accessToken?)` — a thin wrapper
used by `apps/api`. Server-side requests pass the caller's Supabase access
token so Postgres RLS policies apply exactly as they do for direct client
access; there is currently no service-role usage anywhere in the codebase
(Phase 1 needs none — see CLAUDE.md rule 4, never write directly to another
domain's tables, and prefer RLS-enforced access over privileged bypass
wherever a request is already authenticated as a real user).
