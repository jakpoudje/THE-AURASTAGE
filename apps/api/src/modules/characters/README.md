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
`relationshipMapEngine` 1.0.0 — the workspace's `relationship_map`: characters who share scenes (approved script appearances),
saved relationships, and relationships the dialogue states, suggested with their line (free; "Add" saves through
`set_relationship`). `pronunciationEngine` 1.0.0 — a sound-it-out spelling for a name (`pronunciation`, migration 0046,
saved through `update_character`); suggested in the profile and filled by the whole-cast fill when empty. Audio Studio's
voice generation speaks names this way (`sayNames`); the script is never changed.

## API endpoints
- `GET  /api/projects/:id/characters` — characters, aliases, appearances, sync state (never/current/stale, from MOS job records), candidates needing confirmation
- `POST /api/projects/:id/characters/sync` — `{confirm?: string[]}`; 412 until the script is approved
- `POST /api/projects/:id/characters/merge` — `{source_id, target_id}` (reversible)
- `PATCH /api/characters/:id` — profile/role/status/name (renames keep the old name as an alias)
- `POST /api/characters/:id/aliases` — `{alias}`
- `POST /api/characters/:id/unmerge` — undo a merge, then re-sync
- `POST /api/projects/:id/characters` — `{name, role?, kind?}` add a character by hand (409 on a name clash)
- `POST /api/projects/:id/relationships` — `{character_a, character_b, relationship, description?}` (one per pair; saving again updates)
- `DELETE /api/relationships/:id`
- `POST /api/characters/:id/looks` — `{id?, name, description?}` create/update a WardrobeLook
- `DELETE /api/looks/:id`

## Database objects
Migration 0006 (+0009: `character_relationships`, `wardrobe_looks`, `create_character`,
`set_character_relationship`, `delete_character_relationship`, `save_wardrobe_look`,
`delete_wardrobe_look`; merges now carry looks and relationships to the survivor): tables above + `sync_script_characters`, `update_character`,
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
Visual/voice DNA, look images and casting options (need Visual Generation /
Audio), CharacterState (Scene DNA), props (Scene/Asset domain). `commands/GenerateCharacters.ts`
is still an empty stub (AI character development needs the Provider Gateway).

## Look & References (migration 0027)
`characters.look.ts` — the character look panel. `characterLookEngine` (1.0.0) builds one identity description from the
profile (+ chosen wardrobe look + the project look from Project Settings) and a prompt per view (front / ¾ / profile /
back × close-up / medium close-up / medium / full); the same identity text is in every prompt. `GET
/api/characters/:id/look?look_id=` returns all 16 views with the latest request and the newest image, flagged `stale`
when it was made from an older identity (never replaced automatically, rule 11). `POST /api/characters/:id/look/generate`
`{ look_id?, views?, provider? }` requests the default 8 views (or the given ones) — built-in AuraStage Sketch by default
(free, labelled "not AI"); a paid image provider only when chosen and connected. Requests are gated `casting:edit`;
the generation worker makes each still through the Provider Gateway (`generateStill`), and the Assets domain registers
it under Characters, linked to the character, with provenance (provider, model, engine version, identity hash, view).
Whole cast in one click (2026-09-30): `POST /api/projects/:id/characters/looks/generate { provider?, redo? }` runs the
same request for every non-merged character's default views as in the profile, skipping views already made from the
current identity or still being made (unless `redo`); it returns per-character counts. Same gate, same worker queue.
Tests: `tests/look.test.ts`, `tests/integration/char_refs_db.sql`, `tests/e2e/casting/run.cjs`.

## Ages (migration 0035)
A character at other points in the story (flashbacks, time jumps, old age): `character_age_states` (label, age, how they
look then), owned by Casting. `GET|POST /api/characters/:id/ages` (`{ id?, label, age, description? }`, gated
`casting:edit`, duplicate name 409, up to 12), `DELETE /api/ages/:id` (its reference views are kept, their age cleared;
Scene DNA that used it is flagged). The look panel takes `age_state_id` (`GET …/look?age_state_id=`, `POST
…/look/generate { age_state_id }`): `characterLookEngine` 1.1.0 describes the character at that age and records the
view's `age_state_id`; views for each age are kept apart from today's. Without an age the prompts and identity hash are
exactly what 1.0.0 made, so existing views aren't flagged by the upgrade. Scene DNA chooses the age per scene; the prompt
compiler (1.3.0) then describes the character at that age and only uses reference views made at that age.
Tests: `engines/character/characterLookEngine/tests`, `tests/integration/character_ages_db.sql`, `tests/e2e/casting/run.cjs`.

## Accent and languages (migration 0037, task 41)
`characters.accent` and `characters.languages` are the writer's choice, saved through `update_character`
(gate_write casting/edit). The workspace read adds `accent_suggestions` per character from
`engines/character/storyAccentEngine` 1.0.0: the stated nationality first, then where the description/background says
they are from, then where their scenes are set, then the project setting — each suggestion lists its evidence. A name
is never evidence. Voice DNA (`voiceCastingEngine` 1.1.0) speaks with the chosen accent where the built-in voice can
and passes it to paid voice providers. The Profile tab lists fields still empty and offers "Develop the rest with AI"
(an Ask AuraStage suggestion, reviewed before anything changes).

## Characters named twice (migration 0042)
`GET /api/projects/:id/characters` returns `duplicates` from `characterDuplicateEngine` (active characters, their
non-name aliases, scene counts, approval, `distinct_from`). Casting shows them as "Same person?" with **Merge them**
(the existing `merge_characters`, undoable from Names & Merges) and **Not the same**:
`POST /api/projects/:id/characters/distinct {a_id, b_id}` → `mark_characters_distinct` (gate `casting:edit`, audit
`CharactersMarkedDistinct`) adds each id to the other's `characters.distinct_from`, so the pair is never suggested again.

## Whole-cast profiles and "Save & next" (owner request 2026-09-30)
`POST /api/projects/:id/characters/apply-suggestions` fills only EMPTY fields for every active character from what is
known without AI — the age and introduction the approved script gives, and the accent and languages `storyAccentEngine`
suggests — each through the same gated save (`update_character`) as a manual edit. Written fields are never changed.
Casting shows a "Profiles for the whole cast" bar: that button (free), and "Develop the rest of every profile with AI"
(one Ask AuraStage request listing each character's empty fields; shown before → after, applied only on request).
The profile's "Save & next →" saves and opens the next character that still needs work (empty fields or not approved);
when the whole cast is complete the page points to the next stage (Locations & Props).

## Actor photos with consent (migration 0048, BUILD_PLAN §8 item 14)

- `GET /api/characters/:id/consents` — consents recorded for the character (newest first), each with the photos used under it.
- `POST /api/characters/:id/consents` `{ performer_name, statement (≥ 20 chars), confirm: true }` → `record_performer_consent`.
- `POST /api/characters/:id/actor-photos` `{ consent_id, asset_id, view: "front:CU", look_id?, age_state_id? }` → `add_actor_photo`:
  links an image already uploaded to the Assets Library (category Characters) as that reference view (`execution 'upload'`,
  `provider 'performer'`) with the character's current identity hash, so it's used exactly like a generated view.
- `POST /api/consents/:id/withdraw` → `revoke_performer_consent`: every photo under it becomes `withdrawn` at once (never the
  view's image again; files stay in the library). A withdrawn consent can't take new photos (AURA-CHR-409).
- The look panel names the performer on an actor photo; the whole-cast generate never overwrites one (even with `redo`);
  readiness evidence for generated reference views ignores uploads.
- All writes are `gate_write(project, 'casting', 'edit')` and audited (PerformerConsentRecorded / ActorPhotoAdded / PerformerConsentWithdrawn).
- Whole-cast fill (`apply-suggestions`, 2026-10-02) also fills **physicality** from the script's action lines and saves
  the relationships the dialogue states between characters who have none yet (`relationships_added`); the relationship
  map has **Add all suggested relationships**. Saved relationships are never replaced.

## See them speak (AuraSketch 3, owner request 2026-10-02)
`GET /api/characters/:id/speak` lists the character's dialogue lines (`has_voice` when Audio Studio has a placed voice
for the line) and the project's sketch style; `?line_id=&angle=front|three_quarter|profile` returns an animated SVG of
the character speaking that line (mouth shapes from `visemesFor`, blinks) timed to the voice clip's length, or to an
estimate from the words, plus `voice_asset_id` so the page plays the voice in step. Reads dialogue lines, audio clips and
the project genre read-only. Look sheets now carry `genre` in their sketch request so AuraSketch draws in the film's
style; `sketch_reads.varied` lists face features varied from the identity seed (not described).
