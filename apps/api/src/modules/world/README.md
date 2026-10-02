# Locations & Props (backend domain, `AURA-WLD`)

Canonical owner of **Location** and **Prop** (SRS §4: "Scene/Asset domain"). Migration `0028_locations_props.sql`.

## What it does
- **Find them in the approved script** (`POST /api/projects/:id/world/sync`): `worldExtractionEngine` 1.0.0 reads the approved
  version (Scriptwriter) and character names (Casting, read-only). Locations come from scene headings — one per place, with
  every INT/EXT, time of day and sub-area; props (and vehicles) from action lines, with the scene and source line as
  evidence. `sync_world` refreshes script facts only; names, descriptions and status are the person's and are never
  overwritten. Something no longer in the script is flagged ("not in the approved script any more"), never deleted (rule 11).
  The sync is recorded as a `jobs` row with the script version it read (rule 10).
- **Edit / add by hand** (`POST /api/projects/:id/world/:kind`, `PATCH /api/world/:kind/:id` with `revision`; stale → 409).
- **Reference views** (`GET /api/world/:kind/:id/look`, `POST .../look/generate`): `worldLookEngine` 1.0.0 builds one identity
  description and a prompt per view — locations: establishing / wide / medium / detail at every time of day the script uses;
  props: hero / ¾ / detail / overhead / in-hand (scale). The built-in AuraStage Sketch is the default (free, labelled "not
  AI"); a connected image provider can be chosen. The generation worker makes each view and the Assets domain registers it
  under Locations / Props / Vehicles, linked to the item. Views made from an older description are marked, never replaced.

## Permissions
Writes are gated like Scene DNA edits: `gate_write(project, 'scene_dna', 'edit')`. Reads are project-scoped by RLS.

## Set dressing and prop continuity (BUILD_PLAN §8 item 12)
The workspace's `continuity` (`propContinuityEngine` 1.0.0, free): each prop's state scene by scene from the words next to it on
its script lines (broken, bloodied, burnt, torn, missing; passing states wet/open), lasting states carried forward until the
script restores them ("new", "repaired", "finds"), warnings where a later scene may forget one, and the set dressing of every
scene. Read-only; nothing is stored.

## Downstream consumers
Assets Library (links, usage), AI & Generation readiness, and the prompt compiler (reference images per shot, and each prop's
state in the scene — promptCompilerEngine 1.5.0).

## One click (owner, 2026-10-02)
`POST /api/projects/:id/world/looks/generate-all` — the standard reference views for every location and prop that has
none or only outdated ones (built-in sketch unless a connected provider is chosen), through `generateWorldLook`.
