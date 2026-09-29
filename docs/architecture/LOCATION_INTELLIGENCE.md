# Location Intelligence — roadmap addition (owner specification, 2026-09-29)

**Status: recorded; not started beyond forward-compatible contracts.** This addition does not interrupt or restructure the
current build. It is implemented in phases L1–L6 when their dependencies are ready. The full owner text is summarised
below section by section; the non-negotiable principle is:

> STORY → LOCATION UNDERSTANDING → REAL-WORLD / FICTIONAL RESOLUTION → LOCATION DNA → SCENE-SPECIFIC LOCATION STATE →
> SPATIAL / GEOGRAPHIC UNDERSTANDING → SHOT-AWARE REFERENCE SELECTION → GENERATION → CONTINUITY VALIDATION
>
> Not "attach a location photo to a prompt".

A two-hour production must be able to return to the same real or fictional place repeatedly and keep its identity,
architecture, geography, orientation, environment, story-time state, camera relationships, sound environment and
visual continuity. Real places are grounded in recognisable real-world characteristics; fictional places get their own
approved canonical reality.

---

## 1. What already exists (and stays)

| Spec concept | Exists today | Where |
|---|---|---|
| Canonical location record | `locations` (one per place, name/description owned by the team, never overwritten by re-sync, flagged not deleted) | migration 0028, `apps/api/src/modules/world` |
| Scene ↔ location link with evidence | `world_appearances` (scene, line, text) | 0028 |
| Location reference views per time of day | `world_reference_images` (view_key like `wide:NIGHT`), files in the Assets Library, linked by `asset_links` | 0028, `engines/world/worldLookEngine` |
| Props / vehicles | `props` + appearances + hero views | 0028 |
| Scene-level state (weather, atmosphere, light, mood) | Scene DNA `editable` | Scene DNA module |
| Shot-aware reference choice | minimal: the location view for the scene's time of day, characters in frame, props' hero views | `generation.service.ts compileShot` (prompt compiler 1.2.0) |
| Impact analysis / never silently overwrite | production graph flags; a Locations & Props edit flags compiled prompts for review | `packages/production-graph`, generation review |
| Asset storage + provenance | Assets Library (single media repository) | Assets module |

Nothing here is replaced. Location DNA **extends** `locations`; Scene Location State **extends** the scene's use of a
location; the Assets Library stays the only media store (Location DNA stores asset ids only).

## 2. Identity vs state (mandatory)

- **Location DNA** = WHAT / WHERE the place is (identity, architecture, geography, spatial layout, day/night
  characteristics, sound character, approved references, provenance). One per place, versioned, approved.
- **Scene Location State** = the place at a story moment (time, weather, damage, lights, crowd, traffic, props present).
  Many per location; each scene uses exactly one. Scene DNA references it and never copies location truth.
- The same apartment in scenes 4, 27 and 81 is one Location DNA with three states — never three apartments.

## 3. Pipeline and engines (logical engines in `engines/world/*`, not microservices)

| Step | Engine | Phase |
|---|---|---|
| Detect location mentions in headings, action, dialogue, travel, entrances/exits, neighbouring scenes | `locationEntityDetectionEngine` (extends `worldExtractionEngine`; model-backed with deterministic checks) | L1 |
| Resolve mentions to entities ("London", "Tower Bridge", "the bridge", "near Tower Bridge"); keep look-alike names apart | `locationEntityResolutionEngine` | L1 |
| Classify: REAL_WORLD_VERIFIED / REAL_WORLD_PROBABLE / REGIONAL_CONTEXT / FICTIONAL / PRODUCTION_SET / AMBIGUOUS / REQUIRES_CONFIRMATION | `locationClassificationEngine` | L1 |
| Geographic resolution (country → region → city → district → landmark; parent/child) | `realWorldLocationResolverEngine` via `LocationDataProvider` | L1 (test provider) / L6 (external) |
| Semantics (environment type, landmark requirements, continuity requirements) | `locationSemanticEngine` | L1 |
| Topology between places (Charing Cross → Trafalgar Square) | `locationTopologyEngine` | L3 |
| Reference discovery + packs | `locationReferenceEngine` | L2 |
| Shot-aware reference selection (wide vs street level vs camera-direction-specific; weighting vs character identity) | `locationReferenceSelectionEngine` (replaces today's minimal choice in `compileShot`) | L3 |
| Story-time state and transitions (intact → damaged → destroyed) | `locationStateEngine` | L1 |
| Geography / screen-direction continuity | `geographyContinuityEngine`, `locationContinuityEngine` | L4 |
| QC on generated takes | `locationQCEngine` | L4 |

Every step keeps confidence and a verification state (VERIFIED, HIGH_CONFIDENCE, PROBABLE, REGIONAL_ONLY, FICTIONAL,
AMBIGUOUS, REQUIRES_CONFIRMATION). Ambiguity is asked of the filmmaker, never invented. A real city with an
unnamed hotel stays "Abuja (city context) + fictional hotel" — no real hotel is invented.

## 4. World Library, Location Packs, providers

- **World Library**: hierarchical and data-driven (continent → country → city → district → landmark); nothing
  hard-coded in the UI; nothing preloaded. Packs are created on demand, reviewed, cached, versioned and reused
  (project-level first; cross-project only where licences permit).
- **Location Pack**: Location DNA + approved references (architectural, street level, aerial where permitted, landmark,
  day/night/weather) + orientation and geographic anchors + ambience characteristics + spatial info + generated
  approved views + rights/provenance.
- **Provider-neutral interface** `LocationDataProvider` — `searchLocation`, `resolveLocation`, `getGeographicMetadata`,
  `getReferenceCandidates`, `getSpatialMetadata`, `getLicenseMetadata` — with `TestLocationProvider` (clearly labelled
  test data), `LocalLocationProvider` (the World Library) and `ExternalLocationProvider`s plugged in later. The whole
  workflow must run on the test provider before any commercial integration. Lives in the Provider Gateway
  (`apps/api/src/providers/location/*`, rule 7).
- **Rights/provenance** on every reference: source, creator/provider, URL/identifier, licence, permitted use, acquired
  date, reference date, restrictions, expiry, AI-derivative status. No scraping or storing of third-party map/street
  imagery unless its terms allow it.

## 5. Spatial DNA and Shot Geography

- **Spatial DNA** (for recurring locations): structured relationships first — "the sofa is opposite the TV", "the
  kitchen is behind camera-left", "the window faces the street", camera zones, movement zones, entrances/exits,
  screen-direction anchors. Designed so depth maps, floor plans, 3D models, photogrammetry, Gaussian splats, NeRF-style
  scenes, set scans and camera tracking can be attached later **without changing Location DNA** (as typed spatial
  representations with asset ids).
- **Shot Geography** (extends Shot DNA): location_id, scene_location_state_id, camera_zone, camera_position,
  camera_direction, subject_positions, landmark_orientation, screen_direction, entry_exit_relationship,
  spatial_anchor_ids, location_reference_ids. Used by Storyboard, AuraSketch, AuraImage and AuraVideo.

## 6. Generation, sound, assistant

- **Generation Package**: structured blocks — STORY_CONTEXT, LOCATION_DNA (with version), SCENE_LOCATION_STATE,
  GEOGRAPHIC_ANCHORS, CHARACTER_DNA, WARDROBE, PERFORMANCE_DNA, SHOT_DNA, REFERENCE_PACKAGE, CONTINUITY_LOCKS,
  NEGATIVE_CONSTRAINTS. The canonical data stays provider-independent; a provider-specific compiler decides what each
  model needs (text, reference images, depth, masks, camera, first/last frames, control images). Prompts are not
  inflated with everything we know.
- **Sound**: Location DNA + Scene Location State propose ambience (rain, traffic, river, wind, room tone, fridge hum,
  neighbours, reverb character) to Audio Studio spotting.
- **Ask AuraStage**: location commands ("move this sequence from Paris to Rome") run impact analysis across scenes,
  Location DNA, dialogue references, Scene DNA, shots, storyboards, takes, ambience and editorial, and show the proposed
  changes before anything runs — never a word replace.

## 7. Production graph relationships (version-aware)

Story → Location Entity → Location DNA → Scene Location State → Scene DNA → Shot Geography → Shot DNA → Reference
Package → Generation Package → (Storyboard, AuraSketch, AuraImage, AuraVideo, AuraSound) → Approved assets / takes →
Editorial. A change to Location DNA or a Scene Location State marks descendants REVIEW_REQUIRED/STALE with impact
counts; nothing expensive or destructive runs without the filmmaker.

## 8. Story-wide Location Report (before expensive generation)

One row per location: name, type (real / regional / fictional / set), scenes, status (verified · references available ·
match found · design required · needs confirmation) — reviewed and approved by the filmmaker.

## 9. Phases

| Phase | Scope | Depends on |
|---|---|---|
| **L1** | Location DNA (extend `locations`), entity detection + resolution (model-backed, evidence per mention), real/fictional classification with confidence, Scene Location State, graph relationships, Location Report | Claude credit; Locations & Props (done) |
| **L2** | World Library hierarchy, Location Packs, Asset Library integration, provenance/rights fields, location review UI, `TestLocationProvider` + `LocalLocationProvider` | L1 |
| **L3** | Location Reference Selection engine, Shot Geography, Storyboard + AuraSketch integration, topology | L2; Shot DNA extension |
| **L4** | AuraImage/AuraVideo + Generation Package blocks, continuity locks, Location Continuity QC | L3; references sent to providers (task #35) |
| **L5** | AuraSound ambience from Location DNA/state, Spatial DNA relationships, Ask AuraStage location commands with impact | L4; ambience library |
| **L6** | External geographic/reference providers, spatial reconstruction, 3D/scan support, virtual scouting, period reconstruction ("real Trafalgar Square geography, 1942 design") | L5; owner-provided provider accounts |

## 10. Forward-compatible decisions made now

- Contracts only (no behaviour change): `packages/contracts/src/location` — verification states, location kinds,
  Location DNA extension fields, Scene Location State, Shot Geography, reference provenance, and the
  `LocationDataProvider` interface — so modules built from now on can target them.
- Kept compatible: `world_reference_images.view_key` (`<view>` or `<view>:<TIME>`) already fits pack views such as
  `street_level:NIGHT`; Location DNA references are asset ids in the Assets Library; the prompt compiler's `world`
  block carries location id + revision, so a Location DNA version and a state id can be added beside them; the
  minimal reference choice in `compileShot` is isolated so `locationReferenceSelectionEngine` replaces it in L3.
