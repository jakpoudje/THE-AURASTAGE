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
- `0004_phase2_scriptwriter.sql` — Scriptwriter story fields on `projects`
  (tone, audience, opening/ending style); `scripts`, immutable
  `script_versions`, and `scenes` (read-only via RLS). All writes go through
  `save_script_version()` (optimistic concurrency, AURA-SCR-409) and
  `approve_script_version()` (idempotent scene upsert; changed scenes →
  `review_state = 'review_required'`, removed scenes → `omitted`, never
  deleted). Both write `ScriptVersionSaved` / `ScriptApproved` audit events.
- `0005_revoke_public_function_execute.sql` — fixes Supabase advisor 0028:
  revokes the default PUBLIC execute grant so signed-out callers can't reach
  SECURITY DEFINER functions; the audit trigger function isn't callable at all.

- `0006_phase3_casting.sql` — Casting: `characters`, `character_aliases`,
  `character_appearances` + sync/update/alias/merge/unmerge functions
  (see apps/api/src/modules/characters/README.md). Test: `tests/integration/casting_db.sql`.
- `0007_project_synopsis.sql` — long-form `synopsis` on projects (≤ 20,000
  chars); the logline stays a short pitch (≤ 500).

- `0008_project_audit_on_org_delete.sql` — fix: deleting an organization with
  projects failed (the project audit trigger wrote a row for the org being
  deleted). Also makes `casting_assert_member` internal-only. Test:
  `tests/integration/org_delete_db.sql`.

- `0009_phase3_relationships_wardrobe.sql` — manual `create_character`,
  `character_relationships`, `wardrobe_looks` (+ save/delete functions); merges
  carry looks and relationships to the surviving character. Test:
  `tests/integration/casting_part2_db.sql`.

Integration check for 0004: `tests/integration/scriptwriter_db.sql` (runs in a
rolled-back transaction; expected output is listed in the file).

## Client

`src/client.ts` exports `createSupabaseClient(accessToken?)` — a thin wrapper
used by `apps/api`. Server-side requests pass the caller's Supabase access
token so Postgres RLS policies apply exactly as they do for direct client
access; there is currently no service-role usage anywhere in the codebase
(Phase 1 needs none — see CLAUDE.md rule 4, never write directly to another
domain's tables, and prefer RLS-enforced access over privileged bypass
wherever a request is already authenticated as a real user).
