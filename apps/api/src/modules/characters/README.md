# Casting & Characters (backend domain)

## Purpose
Canonical authority for Character identity (SRS §3, §6). CharacterState
(story-time look/condition) arrives with Scene DNA (Phase 5).

## Canonical owner
`characters`, `character_aliases`, `character_appearances` (derived evidence).

## Inputs / reads
The approved script version (`scripts`, `script_versions`, read-only) and
the project's scenes.

## Outputs / writes
Characters (created from confident script candidates or confirmed by a
person), aliases, per-scene appearances stamped with `source_version_id`.

## Relevant engines
`engines/character/characterCandidateExtractionEngine` (evidence + confidence,
SRS §6.1) and `characterIdentityResolutionEngine` (alias/merge-aware matching, §6.2).

## API endpoints
- `GET  /api/projects/:id/characters` — characters, aliases, appearances, sync state (never/current/stale, from MOS job records), candidates needing confirmation
- `POST /api/projects/:id/characters/sync` — `{confirm?: string[]}`; 412 until the script is approved
- `POST /api/projects/:id/characters/merge` — `{source_id, target_id}` (reversible)
- `PATCH /api/characters/:id` — profile/role/status/name (renames keep the old name as an alias)
- `POST /api/characters/:id/aliases` — `{alias}`
- `POST /api/characters/:id/unmerge` — undo a merge, then re-sync

## Database objects
Migration 0006: tables above + `sync_script_characters`, `update_character`,
`add_character_alias`, `merge_characters`, `unmerge_character`. Tables are
read-only through RLS; all writes go through these functions.

## Events emitted
`CharactersSynced`, `CharacterUpdated`, `CharacterAliasAdded`, `CharacterMerged`,
`CharacterUnmerged` (audit_events); every sync also writes a completed MOS `jobs` row.

## Permissions
Org membership (RLS + function checks). 403 for other orgs' projects/characters.

## Tests
`./tests/routes.test.ts`, `tests/integration/casting_db.sql`, `tests/e2e/casting`.

## Known operational error codes
AURA-CHR-002 invalid input · 403 no access · 404 not found · 409 name clash /
merged / script changed · 412 script not approved · 500 unexpected.

## Not built yet
Relationships, wardrobe looks, visual/voice DNA and casting options (need
Visual Generation / Audio), CharacterState (Scene DNA). `commands/GenerateCharacters.ts`
is still an empty stub (AI character development needs the Provider Gateway).
