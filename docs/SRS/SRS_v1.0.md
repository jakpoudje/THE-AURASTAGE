**THE AURASTAGE**

**Advanced AI Film Production Operating System**

**Complete Software Requirements Specification**

Frontend • Backend • AI Engines • Scene DNA • Media Pipelines •
Collaboration • APIs • Infrastructure

Version 1.0 \| Authoritative Rebuild Baseline \| 25 September 2026

# Purpose

This document defines The AuraStage as an implementation-grade,
long-form film production platform. It is intended to be understandable
by a CTO, software engineer, AI engineer, media-pipeline engineer, UX
engineer, DevOps/SRE team, or an AI coding environment such as Claude.
It deliberately specifies both what the filmmaker experiences and what
the software must do behind each interaction.

# Non-negotiable architecture

-   One field → one canonical authority → many consumers. No competing
    copies of story, character, scene, shot or technical truth.

-   Scene DNA is the central scene-level synthesis layer; it references
    upstream authorities rather than replacing them.

-   AI proposes, analyzes and generates; authorized humans approve and
    lock.

-   No fake controls, fake readiness percentages or decorative
    system-status indicators.

-   Every generated artifact is versioned, attributable, reproducible as
    far as provider capabilities allow, and linked to its source
    versions.

-   Provider-specific code is isolated behind adapters. The production
    graph must survive a vendor change.

# 1. Product Scope and Canonical Workflow

  -----------------------------------------------------------------------
  **Workspace**                       **Authority / role**
  ----------------------------------- -----------------------------------
  Home                                Public marketing, product
                                      explanation, sign-in/get-started.
                                      No project editing.

  Dashboard                           Project command centre: readiness,
                                      assignments, reviews, activity and
                                      navigation.

  1\. Scriptwriter                    Owns story setup, target runtime,
                                      genre/subgenre, setting/period,
                                      screenplay, structure and story
                                      facts.

  2\. Casting & Characters            Owns canonical Character DNA,
                                      relationships, visual identity,
                                      voice profile, wardrobe looks and
                                      character state definitions.

  3\. Dialogue Intelligence           Owns dramatic/written dialogue
                                      intelligence: speaker, intention,
                                      subtext, emotion, reaction beats,
                                      knowledge and written voice.

  4\. Scene DNA                       Synthesizes approved story +
                                      character + dialogue +
                                      world/assets + project
                                      technical/visual rules into one
                                      scene-specific production
                                      blueprint.

  5\. Storyboard & Shots              Owns Shot DNA, coverage,
                                      cinematography, storyboard frames
                                      and animatic planning.

  6\. Visual Generation               Owns generation packages, provider
                                      execution, Takes, visual QC, repair
                                      and Approved Takes.

  7\. Audio Studio                    Owns professional DAW sessions,
                                      dialogue/ADR, Foley, SFX, ambience,
                                      music, routing, automation, mixes
                                      and stems.

  8\. Editorial & Timeline            Owns NLE assembly, edit decisions,
                                      color/VFX state, review versions
                                      and Picture Lock.

  9\. Export & Deliver                Owns Render Manifests,
                                      localization, technical QC,
                                      masters, packages and deliverables.

  Project Settings                    Horizontal authority for technical
                                      specifications, provider policy,
                                      production metadata and delivery
                                      defaults. Story fields are
                                      inherited read-only from
                                      Scriptwriter.

  Team & Collaboration                Horizontal human orchestration:
                                      users, roles, permissions,
                                      assignments, tasks, comments,
                                      reviews, approvals, notifications
                                      and audit.

  Assets Library                      Horizontal canonical
                                      media/reference repository and
                                      asset lineage/usage authority.

  Help & Support                      Context-aware knowledge,
                                      diagnostics, system/provider status
                                      and support; never bypasses
                                      permissions.
  -----------------------------------------------------------------------

## 1.1 Production backbone

Project/Story → Character DNA → Dialogue Intelligence → Scene DNA → Shot
DNA → Generation Package → Take → Approved Take → Audio/Editorial →
Picture Lock → Render Manifest → Deliverable.

Project Settings, Assets Library, Team & Collaboration, MOS, Provider
Gateway, Audit/Event Log and Help/Diagnostics operate horizontally
across the entire backbone.

# 2. System Architecture

  -----------------------------------------------------------------------
  **Layer**                           **Engineering responsibility**
  ----------------------------------- -----------------------------------
  Client application                  Responsive professional web UI;
                                      timeline/waveform/video canvases;
                                      inspectors; progressive disclosure;
                                      keyboard shortcuts; real-time
                                      collaboration presence.

  API / BFF                           Authentication context,
                                      authorization, schema validation,
                                      rate limits, query composition,
                                      signed-media access and
                                      websocket/realtime endpoints.

  Domain services                     Project, screenplay, character,
                                      dialogue, world/location, Scene
                                      DNA, shot, generation, audio,
                                      editorial, render, asset and
                                      collaboration services.

  MOS                                 Module Orchestration System:
                                      dependency/readiness evaluation,
                                      jobs, retries, idempotency,
                                      invalidation, approvals, cost
                                      controls and asynchronous
                                      execution.

  AI engine layer                     Typed deterministic, statistical,
                                      LLM, vision/audio and
                                      media-analysis engines. Each engine
                                      has explicit
                                      inputs/outputs/version.

  Provider Gateway                    Vendor-neutral adapters for
                                      reasoning/text, image, video,
                                      voice, STT, music/SFX, lip-sync,
                                      upscaling/repair and
                                      moderation/safety as required.

  Media pipeline                      Transcode, proxy, waveform,
                                      thumbnails, frame extraction,
                                      mux/demux, render, encode, package
                                      and QC.

  Data plane                          PostgreSQL canonical relational
                                      store; object storage; queue/cache;
                                      search/vector index; optional graph
                                      projection.

  Observability                       Structured logs, distributed
                                      traces, metrics, provider request
                                      IDs, cost ledger, audit events,
                                      health and diagnostics.
  -----------------------------------------------------------------------

## 2.1 Recommended deployment topology

-   Web app: TypeScript + React/Next.js-class framework.

-   Backend: TypeScript/Node or Python/FastAPI services; use one primary
    backend language initially to reduce operational complexity.

-   Canonical DB: PostgreSQL with migrations, row-level tenant
    constraints and transactional outbox.

-   Object storage: S3-compatible storage; CDN for previews/proxies;
    signed URLs.

-   Queue/cache: Redis + BullMQ/Celery-class workers initially;
    Kafka/NATS only when event volume/organizational scale justifies it.

-   Media workers: containerized FFmpeg/media jobs with CPU/GPU queues.

-   Search: PostgreSQL full-text initially; vector extension such as
    pgvector; dedicated search engine only when scale requires.

-   Realtime: WebSocket/SSE layer for job state, presence, comments,
    approvals and render progress.

## 2.2 Event model

Canonical writes and event publication MUST be transactionally coupled
through an outbox. Representative events: ScriptApproved,
CharacterDNAApproved, DialogueApproved, SceneDNAApproved, ShotApproved,
TakeApproved, MixApproved, PictureLocked, RenderRequested,
DeliverableCompleted, UpstreamVersionChanged.

# 3. Canonical Data Model and Authority

  -------------------------------------------------------------------------------------------
  **Entity**                       **Canonical owner**     **Purpose**
  -------------------------------- ----------------------- ----------------------------------
  Organization                     Collaboration           Tenant/studio boundary

  Project                          Project Settings +      Production root
                                   Scriptwriter-owned      
                                   story fields            

  Script                           Scriptwriter            Versioned screenplay

  Act / Sequence / Scene           Scriptwriter            Narrative hierarchy and scene
                                                           production anchor

  Character                        Casting                 Canonical identity

  CharacterState                   Casting + Scene DNA     Story-time
                                   resolution              look/condition/knowledge/emotion
                                                           state

  DialogueLine                     Dialogue Intelligence   Approved spoken/written line and
                                                           semantic/performance annotations

  Location                         Scene/Asset domain      Canonical place/set

  Prop                             Scene/Asset domain      Canonical prop

  WardrobeLook                     Casting                 Named character look

  SceneDNA                         Scene DNA               Versioned scene production
                                                           blueprint

  Shot                             Storyboard & Shots      Canonical Shot DNA

  GenerationPackage                Visual Generation       Provider-neutral generation spec

  Take                             Visual Generation       One generated/recorded result

  Asset / AssetVersion             Assets Library          Media/reference metadata, lineage
                                                           and rights

  AudioSession                     Audio Studio            DAW session authority

  AudioTrack/Clip/Bus/Automation   Audio Studio            Mix/session objects

  AssemblyTimeline                 Editorial               NLE timeline authority

  PictureLock                      Editorial               Approved immutable timeline
                                                           reference

  RenderManifest                   Export                  Immutable render specification

  Deliverable                      Export                  Master/package output

  Task/Comment/Review/Approval     Collaboration           Human workflow

  Job/EngineRun                    MOS                     Execution state and telemetry

  AuditEvent                       Platform                Immutable actor/action/version
                                                           history
  -------------------------------------------------------------------------------------------

## 3.1 Single-authority examples

-   Target runtime, genre, setting, period and narrative structure are
    edited in Scriptwriter. Project Settings displays them as inherited
    and links back to Scriptwriter.

-   Master frame rate, aspect ratio, color pipeline, sample rate and
    provider policy are edited in Project Settings and inherited by
    production pages.

-   Character identity is edited in Casting. Scene DNA selects the
    correct CharacterState for that story moment; it does not redefine
    the character.

-   Approved dialogue text is owned by Dialogue Intelligence. Audio
    Studio realizes it sonically but does not silently rewrite it.

-   Media bytes are stored once as Assets/AssetVersions; Scene DNA, Shot
    DNA, Audio and Editorial reference Asset IDs.

# 4. Page Synchronization and UX/Backend Contracts

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Page**        **User**                    **Primary actions**                      **Reads**        **Writes / passes**                   **Rule**
  --------------- --------------------------- ---------------------------------------- ---------------- ------------------------------------- --------------------------------
  Home            Visitor                     Explore product, workflow,               Public           Auth/session                          No production objects.
                                              pricing/showcase/resources; sign in/get  content/config                                         
                                              started                                                                                         

  Dashboard       Producer/team               Open project/stage, review readiness,    All stage        Task/review/navigation actions        Readiness is computed from
                                              tasks, activity                          summaries +                                            predicates.
                                                                                       collaboration                                          

  Scriptwriter    Writer/director             Set story parameters; outline;           Project story    Script, Scenes, candidate             Runtime is structural, not
                                              generate/import/edit screenplay; approve config           characters/locations/props/dialogue   padding.

  Casting &       Casting/director/costume    Resolve characters; build DNA;           Script           Character, CharacterDNA,              Alias/entity resolution is
  Characters                                  relationships; visuals; wardrobe; voice; extraction +     WardrobeLook, CharacterState          idempotent.
                                              approve                                  assets                                                 

  Dialogue        Writer/dialogue editor      Refine dialogue, intention, subtext,     Script +         DialogueLine versions and scene       Written/performance semantics,
  Intelligence                                emotion, reactions, knowledge            Character DNA    conversation model                    not audio synthesis.

  Scene DNA       Director/department heads   Generate/refine/lock scene blueprint     Script +         SceneDNA + continuity/readiness       Central synthesis; version
                                                                                       Character +                                            references preserved.
                                                                                       Dialogue +                                             
                                                                                       world/assets +                                         
                                                                                       project rules                                          

  Storyboard &    Director/cinematographer    Generate/edit coverage, shot details,    Approved         Shot DNA + storyboard assets          Professional camera vocabulary;
  Shots                                       storyboard, animatic                     SceneDNA                                               editable recommendations.

  Visual          Visual/VFX/director         Compile, generate, compare, repair, QC,  Shot/Scene DNA + GenerationPackage + Takes +           No destructive regeneration.
  Generation                                  approve                                  refs + provider  ApprovedTake                          
                                                                                       policy                                                 

  Audio Studio    Sound/ADR/composer/mixer    Record/generate/conform/mix dialogue,    Dialogue +       AudioSession + stems + master         DAW-class
                                              Foley, SFX, ambience, music              Scene/Shot +                                           multitrack/routing/automation.
                                                                                       picture + audio                                        
                                                                                       assets                                                 

  Editorial &     Editor/director/color/VFX   Assemble, trim, color, VFX, review, lock Approved takes + Timeline versions + PictureLock       NLE semantics and frame-accurate
  Timeline                                                                             audio + metadata                                       review.

  Export &        Producer/QC                 Localize, render, QC, package, archive   PictureLock +    RenderManifest + QC + Deliverables    Async/reproducible.
  Deliver                                                                              mix +                                                  
                                                                                       subtitles +                                            
                                                                                       project delivery                                       
                                                                                       rules                                                  

  Project         Owner/producer/tech lead    Configure                                Project +        Project technical/provider policy     No duplicate story controls.
  Settings                                    technical/provider/production/delivery   inherited story                                        
                                              defaults                                 summary                                                

  Team &          Authorized team             Roles, tasks, assignments, comments,     All domain       Workflow + audit                      Server-side RBAC/ABAC.
  Collaboration                               reviews, approvals                       object IDs                                             

  Assets Library  Departments                 Upload/find/version/relate assets        Storage +        Assets/versions/relationships         Canonical media memory.
                                                                                       production graph                                       

  Help & Support  All users                   Search help, ask contextual assistant,   KB + permitted   Support objects/navigation actions    Never bypass authorization or
                                              diagnostics/tickets                      production/job                                         mutate silently.
                                                                                       context                                                
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# 5. Scriptwriter Engineering

The Scriptwriter is a structured screenplay system. A screenplay is
stored as typed elements---scene headings, action, character cues,
dialogue, parentheticals, transitions and metadata---not as one
undifferentiated text blob.

## 5.1 Runtime-driven story planning

Let R be target runtime in minutes. The system creates a ScopePlan
rather than assuming a fixed scene count. A configurable genre/style
prior estimates scene-duration distribution and dialogue/action density.
The user may override all recommendations.

A useful planning relation is N_scene ≈ R / μ_scene, where μ_scene is
the project's estimated mean scene duration derived from genre,
structure and pacing preferences. This is a planning prior, not a hard
filmmaking rule. Act/sequence time budgets sum to R within tolerance,
while screenplay page count is treated as an approximate heuristic only.

## 5.2 Script approval extraction

-   Parse structured screenplay.

-   Create/update Scene records idempotently.

-   Extract character candidates, dialogue ownership, locations, props,
    vehicles and chronology clues.

-   Resolve aliases against canonical entities.

-   Write evidence links back to exact screenplay element/version.

-   Emit ScriptApproved and extraction jobs.

# 6. Character Determination and Casting Intelligence

Character extraction must not rely on regex or name substring matching
alone. Structured screenplay syntax supplies hard evidence; AI resolves
ambiguity.

## 6.1 Candidate evidence

  -----------------------------------------------------------------------
  **Signal**                          **Treatment**
  ----------------------------------- -----------------------------------
  Character cue / dialogue speaker    Hard presence and identity
                                      evidence.

  Explicit entrance/action mention    Strong presence evidence.

  Scene heading metadata / cast list  Strong metadata evidence.

  Pronoun/coreference                 Probabilistic; must resolve to an
                                      existing present entity.

  Alias/nickname/title                Entity-resolution evidence.

  Off-screen / VO                     Participating speaker but not
                                      necessarily visually present.

  Crowd/group role                    Group entity unless narrative
                                      evidence warrants an individual
                                      Character.

  Explicit exit/absence               Negative presence evidence.
  -----------------------------------------------------------------------

Recommended participation confidence: P(present\|x)=σ(w₀+Σwᵢxᵢ). Hard
cues can force inclusion. Ambiguous candidates below the automatic
threshold are surfaced for human confirmation rather than silently
inserted.

## 6.2 Character identity resolution

Entity similarity may combine normalized-name similarity, alias match,
scene co-occurrence, role-description similarity, relationship evidence
and dialogue signature. Canonical merges are reversible administrative
actions with an audit trail.

## 6.3 Character state

Character DNA defines enduring identity. CharacterState defines
story-time state: wardrobe look, hair/makeup, injuries, dirt/wetness,
carried props, emotional state, knowledge state, relationship state and
physical condition. Scene DNA resolves the appropriate state rather than
creating a second identity.

# 7. Dialogue Intelligence

Dialogue Intelligence sits between Casting and Scene DNA because
dialogue interpretation depends on character identity, relationships,
goals and knowledge. Each line stores speaker, listeners, text,
intention, subtext, emotion/intensity, reaction dependencies, knowledge
dependencies, timing estimate and version/approval.

-   Detect character voice drift and repeated phrasing.

-   Flag exposition density and information the speaker should not know.

-   Track callbacks, unanswered questions and terminology.

-   Model silence, interruption and reaction beats.

-   Allow expand/condense/rewrite as alternative versions; approval
    determines downstream authority.

# 8. Scene DNA --- Central Production Intelligence

Scene DNA is the heart of The AuraStage. It is a structured, versioned
materialization of everything required to produce one scene, while
preserving references to the authoritative upstream versions.

  -----------------------------------------------------------------------
  **Domain**                          **Scene DNA contents**
  ----------------------------------- -----------------------------------
  Narrative                           purpose, stakes, reveal/payoff,
                                      story time, intended duration

  Participants                        Character IDs, visual/off-screen
                                      status, CharacterState versions,
                                      entrance/exit

  Dialogue/performance                DialogueLine IDs, intention,
                                      subtext, emotion, reaction/silence
                                      beats

  Location/geography                  Location ID, set/room, topology,
                                      orientation, landmarks

  Environment                         time, season, weather,
                                      crowd/traffic, atmosphere

  Wardrobe/HMU                        WardrobeLook, accessories,
                                      hair/makeup, injuries/dirt/wetness

  Props/vehicles                      identity, ownership, state,
                                      position, interaction

  Blocking                            positions, paths, distance, facing,
                                      eyelines, entrances/exits, gestures

  Cinematic intent                    visual mood, coverage priorities,
                                      camera energy, lens tendencies

  Lighting                            motivated sources, key/fill/rim,
                                      practicals, contrast,
                                      exposure/color intent

  Sound intent                        room tone, ambience, Foley/SFX
                                      candidates, score intention,
                                      acoustics

  Continuity                          previous/next state anchors,
                                      deliberate discontinuities,
                                      conflicts

  Technical                           inherited aspect/frame
                                      rate/timebase/generation
                                      constraints

  Readiness                           missing requirements, warnings,
                                      approval/lock/version evidence
  -----------------------------------------------------------------------

## 8.1 Scene DNA execution

1\. Load approved Script scene and adjacent narrative context.

2\. Resolve visual, off-screen and voice-only participants.

3\. Load approved Character DNA and story-time CharacterState.

4\. Load approved Dialogue Intelligence; permit explicit silent-scene
state.

5\. Resolve canonical location, environment, wardrobe, props, vehicles
and reference assets.

6\. Project continuity state from prior story-time events.

7\. Generate structured Scene DNA proposal under a strict schema.

8\. Run deterministic continuity/readiness validators.

9\. Present editable proposal and evidence/warnings to authorized user.

10\. On approval, freeze version references, create dependency edges and
emit SceneDNAApproved.

# 9. Storyboard, Shot DNA and Cinematography

Shot Intelligence translates Scene DNA into cinematography. It does not
rewrite the scene. The UI exposes extensive professional vocabulary
through categorized controls while AI recommendations remain editable.

  -----------------------------------------------------------------------
  **Category**                        **Examples**
  ----------------------------------- -----------------------------------
  Shot size/type                      EWS, WS, full, medium-wide, cowboy,
                                      medium, MCU, CU, ECU, two-shot,
                                      three-shot, group, OTS, POV,
                                      insert, cutaway, reaction,
                                      establishing, master, macro/detail.

  Angle/height                        Eye, high, low, Dutch, overhead,
                                      bird's-eye, worm's-eye, ground,
                                      hip, shoulder, aerial.

  Movement                            Static, pan, tilt, roll, push/pull,
                                      dolly, truck, pedestal, tracking,
                                      arc/orbit, crane/jib, gimbal,
                                      Steadicam, handheld, drone, zoom,
                                      dolly-zoom, whip pan.

  Focus                               Deep/shallow, focus pull, rack
                                      focus, subject tracking.

  Support                             Tripod, shoulder, handheld, gimbal,
                                      Steadicam, dolly/slider, crane/jib,
                                      vehicle rig, drone, virtual camera.
  -----------------------------------------------------------------------

Shot DNA includes scene_id, beat/dialogue references, characters/states,
blocking, size/type, camera position/height/angle, lens/focal length,
aperture/DOF, focus plan, composition, movement/support, duration, frame
rate, lighting, prop/location refs, continuity anchors, storyboard ref,
transition intent and generation constraints.

## 9.1 Coverage mathematics

Story duration and source coverage are different. Let Tₛ be intended
scene story time. Coverage C = measure(union of planned editorial
story-time intervals) / Tₛ. A viable plan targets C≈1 for mandatory
beats, while raw source duration may be several multiples of Tₛ because
alternate setups overlap. Mandatory dialogue/action/reaction beats are
constraints, not merely duration totals.

# 10. Prompt Composition and Visual Generation

The Prompt Compiler produces a structured provider-neutral
GenerationPackage, not merely prose. Provider adapters translate it into
each vendor's supported parameters.

  -----------------------------------------------------------------------
  **GenerationPackage block**         **Source**
  ----------------------------------- -----------------------------------
  Project visual/genre/world rules    Project Settings + World DNA

  Scene context                       Approved Scene DNA

  Camera/lens/movement/composition    Approved Shot DNA

  Character identity/state            Character DNA + CharacterState

  Wardrobe/HMU/props/vehicles         Canonical IDs + Asset versions

  Performance/action/dialogue beat    Scene DNA + Dialogue Intelligence

  Lighting/environment                Scene DNA

  Reference images/frames             Assets + storyboard + previous
                                      approved take

  Technical requirements              Project Settings + Shot DNA

  Negative constraints                Continuity + provider capability
                                      rules

  Provenance                          All source version IDs
  -----------------------------------------------------------------------

-   Each generation creates a Take.

-   Take stores provider/model/version, parameters, seed if available,
    cost, source versions and QC.

-   Compare Takes side-by-side; approval is explicit.

-   Visual QC checks identity, wardrobe/props, environment, camera
    intent, lighting and temporal stability.

-   Prefer targeted repair where provider capability permits; otherwise
    create a new Take.

# 11. Audio Studio --- Professional DAW and Mixer

The Audio Studio must support feature-film post-production rather than a
simplified creator mixer.

  -----------------------------------------------------------------------
  **Subsystem**                       **Requirements**
  ----------------------------------- -----------------------------------
  Timeline                            Waveforms, sample/frame-aware
                                      positioning, snapping,
                                      markers/regions, comp/takes,
                                      fades/crossfades, slip/trim, time
                                      stretch/pitch, clip gain/envelopes.

  Track families                      DX, ADR, VO, production sound,
                                      Foley, hard/designed FX,
                                      BG/ambience, crowds/walla,
                                      vehicles, source music, score,
                                      instrument stems, auxes, buses,
                                      VCAs/groups.

  Channel strip                       Trim, polarity where applicable,
                                      pan/width, inserts, sends/returns,
                                      automation, metering.

  Processing                          EQ, compression, expansion/gate,
                                      de-essing, saturation, limiting,
                                      reverb/delay, restoration and
                                      spatial processing.

  Routing                             Tracks → department submixes →
                                      DX/FX/BG/MX → print master;
                                      sidechains and auxes.

  Metering                            Peak/RMS, true peak, loudness,
                                      spectrum, phase/correlation and
                                      surround/spatial meters where
                                      supported.

  Outputs                             Full mix, dialogue, ADR/VO, FX,
                                      Foley, BG, music, M&E and
                                      alternate-language/format masters.
  -----------------------------------------------------------------------

Scene DNA can propose Foley, ambience, acoustic perspective and score
intent from action, surfaces, location, camera perspective and
performance. Suggestions remain editable. Dialogue Intelligence owns the
words; Audio Studio owns sonic realization.

# 12. Editorial, Picture Lock, Export and Delivery

-   Editorial provides NLE operations: insert/overwrite, ripple/roll,
    slip/slide, trim/blade, lift/extract, grouping/linking, nesting,
    sync and configurable shortcuts.

-   First assembly may be AI-assisted using approved shot order,
    dialogue timing, action continuity and emotional beats; editor
    retains control.

-   Color supports project color management, shot grades, scopes,
    matching, curves/qualifiers/masks/tracking as implementation
    matures.

-   Picture Lock is a formal approved version. Breaking it triggers
    impact analysis for sound, ADR, Foley, subtitles, VFX, color and
    renders.

-   RenderManifest is immutable and includes exact timeline, picture
    lock, audio, subtitle, color, source versions, resolution, frame
    rate, aspect, codec/container, bit depth, color/HDR, channel layout,
    metadata and delivery-profile version.

-   Final QC covers picture, audio, subtitle/caption and package
    integrity; issues link back to exact source/timecode.

# 13. Team, Assets, Settings and Help

## 13.1 Project Settings

Owns production-wide technical/provider/delivery configuration. Story &
Creative Summary is inherited from Scriptwriter and is read-only here.
Major late changes (e.g., 24→25 fps) invoke impact analysis and offer
cancel, future-only, branch/new project version or controlled migration.

## 13.2 Team & Collaboration

Supports Owner, Producer, Director, Writer, Script Editor, Casting
Director, Dialogue Editor, Cinematographer, Storyboard Artist,
Production Designer, Costume/Wardrobe, Sound Designer, ADR Editor,
Composer, Re-recording Mixer, Editor, Colorist, VFX, QC/Delivery and
Reviewer. Permissions include view, comment, create, edit, generate,
approve, lock and administer at project/module/object scope.

## 13.3 Assets Library

Asset storage separates master bytes from metadata and relationships.
Each asset has ID, versions, source/provenance, rights, derivatives,
usage graph and checksum. Masters may have mezzanine, editing proxy and
preview/thumbnail derivatives. Search combines structured metadata, full
text and multimodal/vector retrieval.

## 13.4 Help & Support

The AuraStage Assistant receives the current module/object context and
permitted production/job diagnostics. It may explain, navigate or
propose actions but cannot bypass authorization or silently mutate
production data. Support tickets may attach diagnostic metadata with
user consent; private scripts/media are not attached automatically.

# 14. MOS --- Orchestration, Readiness, Versions and Invalidation

MOS is a coordinator, not a source of truth. It schedules engines,
evaluates dependency predicates, enforces idempotency, retries typed
failures, performs provider fallback under policy, records telemetry and
marks downstream work stale when upstream authority changes.

## 14.1 Readiness

Readiness is evidence-based. Example: ShotPlanningReady(scene) =
SceneDNA.approved ∧ technical_config.valid ∧
no_blocking_continuity_errors. A silent scene may still be ready;
missing dialogue is only blocking when dialogue is expected.

## 14.2 Invalidation

When approved version U becomes U′, the dependency graph is traversed.
Descendants are marked REVIEW_REQUIRED or STALE according to dependency
type; they are never automatically deleted. A useful impact priority is
I = Σ(cⱼ × dⱼ × kⱼ × aⱼ), where c is business/continuity criticality, d
dependency strength, k downstream recomputation cost and a approval
weight.

## 14.3 Job state

  ---------------------------------------------------------------------------------------
  **Field**                           **Requirement**
  ----------------------------------- ---------------------------------------------------
  job_id                              Unique

  idempotency_key                     Stable for semantically identical work

  engine_id/version                   Exact implementation

  input_snapshot                      Exact canonical version IDs

  status                              queued/running/waiting/completed/failed/cancelled

  attempt/heartbeat                   Retry and liveness

  provider_request_id                 External trace when available

  cost                                Estimated and actual

  output_refs                         Created/updated IDs

  error                               Typed code + safe user message + diagnostic detail

  timestamps                          created/started/completed
  ---------------------------------------------------------------------------------------

# 15. AI / Deterministic Engine Registry

This is the authoritative rebuild registry. Names that were known from
the earlier prototype are retained where appropriate; additional engines
are deliberately specified for the rebuild. Every engine must implement
a typed contract: engine_id, semantic version, input schema, output
schema, trigger, permissions, idempotency behavior, telemetry and tests.
Inputs, outputs and triggers below are operational engine contracts, not
placeholder labels; implementation schemas must materialize the stated
objects as typed IDs/versions and evidence records.

Registry size in this specification: 255 individually named engines.

## Story & Screenplay

  ----------------------------------------------------------------------------------------------------------------------
  **Engine**                           **Responsibility**       **Inputs**        **Outputs**       **Trigger**
  ------------------------------------ ------------------------ ----------------- ----------------- --------------------
  narrativeBrainEngine                 Film-wide narrative      Project story     Versioned         Story
                                       model: premise, themes,  brief; target     story/structure   setup/import/edit,
                                       causality, stakes,       runtime; approved analysis, plan,   Script version
                                       unresolved threads.      Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  storyIntelligenceMasterEngine        Coordinates story        Project story     Versioned         Story
                                       analysis and             brief; target     story/structure   setup/import/edit,
                                       consolidates             runtime; approved analysis, plan,   Script version
                                       diagnostics.             Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  actStructureEngine                   Plans/validates acts and Project story     Versioned         Story
                                       turning points against   brief; target     story/structure   setup/import/edit,
                                       runtime/structure.       runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  sequenceArchitectureEngine           Groups beats/scenes into Project story     Versioned         Story
                                       dramatic sequences.      brief; target     story/structure   setup/import/edit,
                                                                runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  beatArchitectureEngine               Builds beat progression  Project story     Versioned         Story
                                       and maps beats to        brief; target     story/structure   setup/import/edit,
                                       scenes.                  runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  conflictArchitectureEngine           Tracks conflicts,        Project story     Versioned         Story
                                       escalation and payoff.   brief; target     story/structure   setup/import/edit,
                                                                runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  themeCoherenceEngine                 Tracks thematic          Project story     Versioned         Story
                                       recurrence and           brief; target     story/structure   setup/import/edit,
                                       unsupported statements.  runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  subplotArchitectureEngine            Tracks subplot           Project story     Versioned         Story
                                       intersections and        brief; target     story/structure   setup/import/edit,
                                       payoffs.                 runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  pacingArchitectureEngine             Allocates narrative time Project story     Versioned         Story
                                       and detects pacing       brief; target     story/structure   setup/import/edit,
                                       imbalance.               runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  openingStrategyEngine                Plans/validates opening  Project story     Versioned         Story
                                       obligations.             brief; target     story/structure   setup/import/edit,
                                                                runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  endingStrategyEngine                 Plans/validates          Project story     Versioned         Story
                                       ending/payoff/closure.   brief; target     story/structure   setup/import/edit,
                                                                runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  screenplayFormatEngine               Parses/renders           Project story     Versioned         Story
                                       structured screenplay    brief; target     story/structure   setup/import/edit,
                                       semantics.               runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  screenplayIntelligenceOrchestrator   Coordinates bounded      Project story     Versioned         Story
                                       screenplay generation    brief; target     story/structure   setup/import/edit,
                                       with continuity memory.  runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  generateFullScreenplay               Generates screenplay     Project story     Versioned         Story
                                       incrementally from       brief; target     story/structure   setup/import/edit,
                                       approved structure.      runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  sceneBoundaryEngine                  Creates scene            Project story     Versioned         Story
                                       boundaries/headings from brief; target     story/structure   setup/import/edit,
                                       structured script.       runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  storyFactExtractionEngine            Extracts locations,      Project story     Versioned         Story
                                       props, events, dates and brief; target     story/structure   setup/import/edit,
                                       facts.                   runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  runtimeScopeEngine                   Converts                 Project story     Versioned         Story
                                       runtime/genre/style into brief; target     story/structure   setup/import/edit,
                                       a scope plan.            runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          

  narrativeContinuityEngine            Finds causal, chronology Project story     Versioned         Story
                                       and story-fact           brief; target     story/structure   setup/import/edit,
                                       contradictions.          runtime; approved analysis, plan,   Script version
                                                                Script/outline    extracted facts   change, or explicit
                                                                versions;         or Script delta   Generate/Analyse
                                                                genre/structure   referenced to     action
                                                                settings as       source elements   
                                                                applicable                          
  ----------------------------------------------------------------------------------------------------------------------

## Character & Casting

  ---------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                        **Responsibility**                  **Inputs**        **Outputs**                                   **Trigger**
  --------------------------------- ----------------------------------- ----------------- --------------------------------------------- -------------------
  extractCharactersFromScreenplay   Extracts character candidates from  Approved Script   Character                                     Script
                                    cues/actions/dialogue.              evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterEntityResolutionEngine   Resolves aliases and prevents       Approved Script   Character                                     Script
                                    duplicate canonical characters.     evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterDNAEngine                Builds identity, biography, goals,  Approved Script   Character                                     Script
                                    fears, traits and arc anchors.      evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterIdentityEngine           Protects canonical identity and     Approved Script   Character                                     Script
                                    identity locks.                     evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterNameEnforcerEngine       Validates canonical names/aliases   Approved Script   Character                                     Script
                                    everywhere.                         evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterNamingEngine             Suggests contextually appropriate   Approved Script   Character                                     Script
                                    names when requested.               evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterArcEngine                Models character transitions across Approved Script   Character                                     Script
                                    story time.                         evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterRelationshipEngine       Builds directed relationship graph. Approved Script   Character                                     Script
                                                                        evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterEmotionEngine            Models emotional trajectories.      Approved Script   Character                                     Script
                                                                        evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterConsistencyEngine        Checks character behavior/identity  Approved Script   Character                                     Script
                                    consistency.                        evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterContinuityEngine         Checks state continuity across      Approved Script   Character                                     Script
                                    scenes.                             evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterVisualEngine             Defines approved visual             Approved Script   Character                                     Script
                                    identity/reference requirements.    evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterVisualContinuityEngine   Compares imagery for identity/look  Approved Script   Character                                     Script
                                    consistency.                        evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterVoiceEngine              Defines                             Approved Script   Character                                     Script
                                    voice/accent/language/performance   evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                    profile.                            canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterLocalizationEngine       Defines pronunciation/localization  Approved Script   Character                                     Script
                                    mappings.                           evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  castingHierarchyEngine            Classifies                          Approved Script   Character                                     Script
                                    lead/supporting/minor/background    evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                    priority.                           canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  wardrobeContinuityEngine          Tracks wardrobe looks across        Approved Script   Character                                     Script
                                    scenes.                             evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  hairMakeupContinuityEngine        Tracks                              Approved Script   Character                                     Script
                                    hair/makeup/injury/dirt/wetness.    evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  characterKnowledgeStateEngine     Tracks what each character knows.   Approved Script   Character                                     Script
                                                                        evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   

  performanceConsistencyEngine      Checks performance-state            Approved Script   Character                                     Script
                                    continuity.                         evidence;         candidate/DNA/state/relationship/continuity   approval/change,
                                                                        canonical         result with evidence, confidence and version  character
                                                                        Character/alias   references                                    edit/approval,
                                                                        records;                                                        Scene DNA request,
                                                                        Character                                                       or
                                                                        DNA/State;                                                      visual-continuity
                                                                        relationships and                                               QC
                                                                        approved                                                        
                                                                        reference Assets                                                
                                                                        as applicable                                                   
  ---------------------------------------------------------------------------------------------------------------------------------------------------------

## Dialogue & Performance

  -----------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                        **Responsibility**                    **Inputs**         **Outputs**               **Trigger**
  --------------------------------- ------------------------------------- ------------------ ------------------------- --------------------
  dialogueExtractionEngine          Maps screenplay dialogue to canonical Project story      Versioned story/structure Story
                                    speakers/scenes.                      brief; target      analysis, plan, extracted setup/import/edit,
                                                                          runtime; approved  facts or Script delta     Script version
                                                                          Script/outline     referenced to source      change, or explicit
                                                                          versions;          elements                  Generate/Analyse
                                                                          genre/structure                              action
                                                                          settings as                                  
                                                                          applicable                                   

  dialogueVoiceprintEngine          Models written                        DialogueLine       Versioned dialogue        Dialogue
                                    vocabulary/syntax/rhythm/formality.   versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueIntentionEngine           Models what a speaker is trying to    DialogueLine       Versioned dialogue        Dialogue
                                    achieve.                              versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueSubtextEngine             Models implied/concealed meaning.     DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueEmotionTrajectoryEngine   Builds conversation emotion curves.   DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueKnowledgeGuardEngine      Flags knowledge-before-learning       DialogueLine       Versioned dialogue        Dialogue
                                    errors.                               versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueExpositionEngine          Measures exposition density.          DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueBalanceEngine             Analyzes turn-taking/dominance.       DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueReactionBeatEngine        Proposes listener/silence/physical    Project story      Versioned story/structure Story
                                    reaction beats.                       brief; target      analysis, plan, extracted setup/import/edit,
                                                                          runtime; approved  facts or Script delta     Script version
                                                                          Script/outline     referenced to source      change, or explicit
                                                                          versions;          elements                  Generate/Analyse
                                                                          genre/structure                              action
                                                                          settings as                                  
                                                                          applicable                                   

  dialogueInterruptionEngine        Models overlap/interruption timing.   DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueCallbackEngine            Tracks callbacks/questions/payoffs.   DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueConsistencyEngine         Detects voice                         DialogueLine       Versioned dialogue        Dialogue
                                    drift/repetition/terminology errors.  versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueExpansionEngine           Creates expanded alternative          DialogueLine       Versioned dialogue        Dialogue
                                    dialogue.                             versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  dialogueCondensationEngine        Creates concise alternative dialogue. DialogueLine       Versioned dialogue        Dialogue
                                                                          versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  tableReadSimulationEngine         Creates timing/performance table-read DialogueLine       Versioned dialogue        Dialogue
                                    previews.                             versions;          annotations/alternative   import/edit,
                                                                          speaker/listener   lines/performance         Character DNA
                                                                          Character DNA;     beats/timing or           change, explicit
                                                                          scene context;     validation issues linked  refine/analyse
                                                                          relationship,      to DialogueLine IDs       action, or Scene DNA
                                                                          emotion and                                  preparation
                                                                          knowledge states                             

  performanceBeatEngine             Converts semantics into playable      Project story      Versioned story/structure Story
                                    performance beats.                    brief; target      analysis, plan, extracted setup/import/edit,
                                                                          runtime; approved  facts or Script delta     Script version
                                                                          Script/outline     referenced to source      change, or explicit
                                                                          versions;          elements                  Generate/Analyse
                                                                          genre/structure                              action
                                                                          settings as                                  
                                                                          applicable                                   
  -----------------------------------------------------------------------------------------------------------------------------------------

## World, Location, Props

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                   **Responsibility**                  **Inputs**             **Outputs**                                                     **Trigger**
  ---------------------------- ----------------------------------- ---------------------- --------------------------------------------------------------- --------------------
  worldDNAEngine               Defines world rules, period,        Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               institutions and technology.        World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  worldContinuityEngine        Checks world-rule consistency.      Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                                                                   World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  environmentalDNAEngine       Defines environmental/atmospheric   Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               state.                              World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  culturalValidationEngine     Flags cultural/contextual           Authenticated actor;   Authorization/workflow/task/review/comment/notification/audit   User collaboration
                               inconsistencies for review.         Organization/Project   or impact-analysis record                                       action, domain state
                                                                   role; target                                                                           transition,
                                                                   object/version;                                                                        mention/event, or
                                                                   workflow state and                                                                     upstream approved
                                                                   requested action                                                                       change

  locationSemanticEngine       Defines canonical location          Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               identity/function.                  World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  locationTopologyEngine       Models room/set topology and        Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               landmarks.                          World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  geographyContinuityEngine    Checks orientation/travel/spatial   Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               consistency.                        World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  periodAccuracyEngine         Checks period-sensitive             Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               language/objects/design.            World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  weatherContinuityEngine      Tracks weather state/transitions.   Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                                                                   World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  timeOfDayContinuityEngine    Tracks time/day-night progression.  Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                                                                   World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  propExtractionEngine         Extracts significant props.         Project story brief;   Versioned story/structure analysis, plan, extracted facts or    Story
                                                                   target runtime;        Script delta referenced to source elements                      setup/import/edit,
                                                                   approved                                                                               Script version
                                                                   Script/outline                                                                         change, or explicit
                                                                   versions;                                                                              Generate/Analyse
                                                                   genre/structure                                                                        action
                                                                   settings as applicable                                                                 

  propIdentityEngine           Creates canonical prop identity.    Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                                                                   World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  propStateContinuityEngine    Tracks                              Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               possession/damage/location/state.   World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  vehicleContinuityEngine      Tracks vehicle                      Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               identity/occupants/damage.          World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  crowdPopulationEngine        Defines crowd composition/behavior. Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                                                                   World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation

  environmentAcousticsEngine   Derives acoustic profile from       Script story facts;    Versioned world/location/environment/prop state, topology or    Story-fact
                               location/materials.                 World/Location/Prop    continuity report with source references                        extraction,
                                                                   records; chronology;                                                                   world/location edit,
                                                                   Scene context;                                                                         Scene DNA
                                                                   approved reference                                                                     generation, or
                                                                   Assets                                                                                 continuity
                                                                                                                                                          validation
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Scene DNA

  ---------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                 **Responsibility**         **Inputs**                     **Outputs**                                **Trigger**
  -------------------------- -------------------------- ------------------------------ ------------------------------------------ -------------------------
  sceneDNAEngine             Synthesizes approved       Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             upstream truth into Scene  context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                             DNA.                       Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneIndexingEngine        Indexes scenes by          Project story brief; target    Versioned story/structure analysis, plan,  Story setup/import/edit,
                             story/production           runtime; approved              extracted facts or Script delta referenced Script version change, or
                             dimensions.                Script/outline versions;       to source elements                         explicit Generate/Analyse
                                                        genre/structure settings as                                               action
                                                        applicable                                                                

  sceneSemanticEngine        Derives scene purpose,     Project story brief; target    Versioned story/structure analysis, plan,  Story setup/import/edit,
                             stakes, beats and reveals. runtime; approved              extracted facts or Script delta referenced Script version change, or
                                                        Script/outline versions;       to source elements                         explicit Generate/Analyse
                                                        genre/structure settings as                                               action
                                                        applicable                                                                

  sceneBlockingEngine        Plans positions, movement, Project story brief; target    Versioned story/structure analysis, plan,  Story setup/import/edit,
                             eyelines and interaction.  runtime; approved              extracted facts or Script delta referenced Script version change, or
                                                        Script/outline versions;       to source elements                         explicit Generate/Analyse
                                                        genre/structure settings as                                               action
                                                        applicable                                                                

  cinematicLightingEngine    Creates motivated lighting Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             intent.                    context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  scenePerformanceEngine     Maps performance beats to  Project story brief; target    Versioned story/structure analysis, plan,  Story setup/import/edit,
                             story-time intervals.      runtime; approved              extracted facts or Script delta referenced Script version change, or
                                                        Script/outline versions;       to source elements                         explicit Generate/Analyse
                                                        genre/structure settings as                                               action
                                                        applicable                                                                

  sceneDurationEngine        Estimates/validates scene  Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             duration.                  context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneContinuityEngine      Runs multi-domain          Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             continuity checks.         context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneReadinessEngine       Evaluates downstream       Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             readiness predicates.      context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneSoundIntentEngine     Defines                    Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             ambience/Foley/SFX/music   context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                             intent.                    Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneTransitionEngine      Defines transition intent  Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             to adjacent scenes.        context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneVersionDiffEngine     Explains version           Project story brief; target    Versioned story/structure analysis, plan,  Story setup/import/edit,
                             changes/impact.            runtime; approved              extracted facts or Script delta referenced Script version change, or
                                                        Script/outline versions;       to source elements                         explicit Generate/Analyse
                                                        genre/structure settings as                                               action
                                                        applicable                                                                

  sceneApprovalEngine        Enforces Scene DNA         Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             review/lock.               context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  sceneDependencyEngine      Builds dependency edges to Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             sources.                   context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    

  scenePromptContextEngine   Normalizes scene context   Approved Scene + adjacent      Versioned Scene DNA component,             Generate/Refine/Approve
                             for prompt compilation.    context; Character DNA/States; readiness/continuity/approval/dependency   Scene DNA or any material
                                                        Dialogue Intelligence;         result linked to exact upstream versions   upstream version change
                                                        World/Location/Prop/Wardrobe                                              
                                                        state; Project                                                            
                                                        technical/visual rules                                                    
  ---------------------------------------------------------------------------------------------------------------------------------------------------------

## Cinematography & Storyboard

  ---------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                   **Responsibility**      **Inputs**              **Outputs**                        **Trigger**
  ---------------------------- ----------------------- ----------------------- ---------------------------------- -----------------------
  shotIntelligenceEngine       Designs coverage from   Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               Scene DNA.              narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  storyboardShotEngine         Creates                 Project story brief;    Versioned story/structure          Story
                               storyboard-ready shot   target runtime;         analysis, plan, extracted facts or setup/import/edit,
                               specification.          approved Script/outline Script delta referenced to source  Script version change,
                                                       versions;               elements                           or explicit
                                                       genre/structure                                            Generate/Analyse action
                                                       settings as applicable                                     

  shotTypeSelectionEngine      Recommends shot         Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               size/type from purpose. narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  cameraAngleEngine            Plans camera            Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               angle/height.           narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  lensSelectionEngine          Plans lens/focal        Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               length/DOF.             narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  cameraMovementEngine         Plans motivated         Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               movement/support.       narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  compositionEngine            Plans framing and       Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               subject hierarchy.      narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  focusPlanEngine              Plans focus             Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               strategy/transitions.   narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  screenDirectionEngine        Tracks                  Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               axis/eyelines/screen    narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                               direction.              beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  coverageCompletenessEngine   Measures mandatory beat Project story brief;    Versioned story/structure          Story
                               coverage.               target runtime;         analysis, plan, extracted facts or setup/import/edit,
                                                       approved Script/outline Script delta referenced to source  Script version change,
                                                       versions;               elements                           or explicit
                                                       genre/structure                                            Generate/Analyse action
                                                       settings as applicable                                     

  shotDurationEngine           Plans editorial/source  Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               durations.              narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  shotSequenceRhythmEngine     Analyzes shot           Project story brief;    Versioned story/structure          Story
                               rhythm/repetition.      target runtime;         analysis, plan, extracted facts or setup/import/edit,
                                                       approved Script/outline Script delta referenced to source  Script version change,
                                                       versions;               elements                           or explicit
                                                       genre/structure                                            Generate/Analyse action
                                                       settings as applicable                                     

  storyboardFrameEngine        Creates storyboard      Project story brief;    Versioned story/structure          Story
                               frames.                 target runtime;         analysis, plan, extracted facts or setup/import/edit,
                                                       approved Script/outline Script delta referenced to source  Script version change,
                                                       versions;               elements                           or explicit
                                                       genre/structure                                            Generate/Analyse action
                                                       settings as applicable                                     

  animaticAssemblyEngine       Builds timed animatic.  Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                                                       narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  shotContinuityEngine         Checks shot-level       Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               continuity.             narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           

  shotReadinessEngine          Evaluates generation    Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                               readiness.              narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                       beats; blocking;        or cinematography validation       request, or Scene DNA
                                                       aspect/frame-rate       linked to Scene DNA version        revision
                                                       rules; cinematography                                      
                                                       preferences and                                            
                                                       reference Assets                                           
  ---------------------------------------------------------------------------------------------------------------------------------------

## Generation & Visual QC

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                      **Responsibility**               **Inputs**                         **Outputs**                                   **Trigger**
  ------------------------------- -------------------------------- ---------------------------------- --------------------------------------------- --------------------------------------------
  generationPackageEngine         Builds provider-neutral          Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  GenerationPackage.               Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  promptCompositionEngine         Composes structured positive     Approved Scene DNA;                Versioned Shot                                Generate/Edit/Approve Shots, storyboard
                                  instructions.                    narrative/performance beats;       DNA/storyboard/animatic/coverage or           request, or Scene DNA revision
                                                                   blocking; aspect/frame-rate rules; cinematography validation linked to Scene DNA 
                                                                   cinematography preferences and     version                                       
                                                                   reference Assets                                                                 

  negativeConstraintEngine        Builds negative constraints.     Typed canonical object/version     Typed versioned decision/state/report with    Explicit domain action or subscribed domain
                                                                   references; authenticated context; evidence, source-version lineage and          event after readiness validation
                                                                   engine configuration               telemetry                                     

  referenceSelectionEngine        Selects exact approved reference Project story brief; target        Versioned story/structure analysis, plan,     Story setup/import/edit, Script version
                                  versions.                        runtime; approved Script/outline   extracted facts or Script delta referenced to change, or explicit Generate/Analyse action
                                                                   versions; genre/structure settings source elements                               
                                                                   as applicable                                                                    

  providerCapabilityEngine        Maintains model/provider         Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  capability matrix.               Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  providerRoutingEngine           Selects compatible route under   Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  policy.                          Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  generationCostEstimatorEngine   Estimates request cost.          Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                                                   Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  generationPreflightEngine       Validates                        Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  package/provider/budget          Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                  constraints.                     reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  takeGenerationEngine            Dispatches generation and        Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  registers Take.                  Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  takeProvenanceEngine            Persists complete Take lineage.  Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                                                   Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  visualQualityEngine             Detects technical/generation     Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  defects.                         Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  identityConsistencyEngine       Checks character identity        Project story brief; target        Versioned story/structure analysis, plan,     Story setup/import/edit, Script version
                                  against refs.                    runtime; approved Script/outline   extracted facts or Script delta referenced to change, or explicit Generate/Analyse action
                                                                   versions; genre/structure settings source elements                               
                                                                   as applicable                                                                    

  wardrobePropConsistencyEngine   Checks wardrobe/prop state.      Approved Script evidence;          Character                                     Script approval/change, character
                                                                   canonical Character/alias records; candidate/DNA/state/relationship/continuity   edit/approval, Scene DNA request, or
                                                                   Character DNA/State; relationships result with evidence, confidence and version  visual-continuity QC
                                                                   and approved reference Assets as   references                                    
                                                                   applicable                                                                       

  environmentConsistencyEngine    Checks                           Script story facts;                Versioned world/location/environment/prop     Story-fact extraction, world/location edit,
                                  location/environment/lighting.   World/Location/Prop records;       state, topology or continuity report with     Scene DNA generation, or continuity
                                                                   chronology; Scene context;         source references                             validation
                                                                   approved reference Assets                                                        

  temporalStabilityEngine         Detects                          Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  flicker/morphing/instability.    Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  targetedRepairEngine            Plans partial repair where       Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  supported.                       Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  takeComparisonEngine            Compares Takes by intent/QC/user Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  notes.                           Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     

  takeApprovalEngine              Promotes selected Take after     Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,  Generate/Regenerate/Repair/Compare/Approve
                                  review.                          Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC    Take or provider capability/status change
                                                                   reference Asset versions; Project  result with provider/model metadata           
                                                                   provider/quality/cost policy                                                     
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Audio & Music

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                      **Responsibility**                 **Inputs**                         **Outputs**                       **Trigger**
  ------------------------------- ---------------------------------- ---------------------------------- --------------------------------- --------------------------------------------
  audioIntelligenceEngine         Proposes audio layers from         Script story facts;                Versioned                         Story-fact extraction, world/location edit,
                                  scene/shot context.                World/Location/Prop records;       world/location/environment/prop   Scene DNA generation, or continuity
                                                                     chronology; Scene context;         state, topology or continuity     validation
                                                                     approved reference Assets          report with source references     

  audioDNAPipelineConnector       Maps sound intent into             Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  AudioSession objects.              versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  dialogueAudioConformEngine      Conforms dialogue/ADR to picture.  DialogueLine versions;             Versioned dialogue                Dialogue import/edit, Character DNA change,
                                                                     speaker/listener Character DNA;    annotations/alternative           explicit refine/analyse action, or Scene DNA
                                                                     scene context; relationship,       lines/performance beats/timing or preparation
                                                                     emotion and knowledge states       validation issues linked to       
                                                                                                        DialogueLine IDs                  

  adrPlanningEngine               Creates ADR cue requirements.      Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                                                     versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  voiceGenerationEngine           Generates authorized synthetic     Approved Shot DNA + Scene DNA;     GenerationPackage, provider       Generate/Regenerate/Repair/Compare/Approve
                                  voice takes.                       Character/wardrobe/prop/location   route/preflight, Take,            Take or provider capability/status change
                                                                     reference Asset versions; Project  provenance, repair plan or        
                                                                     provider/quality/cost policy       visual-QC result with             
                                                                                                        provider/model metadata           

  speechToSpeechEngine            Transforms authorized performance  Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  voice.                             versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  lipSyncTimingEngine             Produces phoneme/viseme timing     Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  targets.                           versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  foleyDetectionEngine            Infers Foley events from           Project story brief; target        Versioned story/structure         Story setup/import/edit, Script version
                                  action/surfaces.                   runtime; approved Script/outline   analysis, plan, extracted facts   change, or explicit Generate/Analyse action
                                                                     versions; genre/structure settings or Script delta referenced to     
                                                                     as applicable                      source elements                   

  sfxDetectionEngine              Infers hard/designed SFX           Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  requirements.                      versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  ambienceEngine                  Defines/creates ambience layers.   Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                                                     versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  roomToneEngine                  Maintains acoustic room-tone       Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  continuity.                        versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  musicCueEngine                  Maps narrative/emotion to score    Project story brief; target        Versioned story/structure         Story setup/import/edit, Script version
                                  cues.                              runtime; approved Script/outline   analysis, plan, extracted facts   change, or explicit Generate/Analyse action
                                                                     versions; genre/structure settings or Script delta referenced to     
                                                                     as applicable                      source elements                   

  musicThemeEngine                Tracks motifs/themes across film.  Project story brief; target        Versioned story/structure         Story setup/import/edit, Script version
                                                                     runtime; approved Script/outline   analysis, plan, extracted facts   change, or explicit Generate/Analyse action
                                                                     versions; genre/structure settings or Script delta referenced to     
                                                                     as applicable                      source elements                   

  lyricSemanticEngine             Analyzes intentional lyric         Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  meaning.                           versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  musicVideoNarrativeEngine       Maps song structure to visual      Project story brief; target        Versioned story/structure         Story setup/import/edit, Script version
                                  narrative.                         runtime; approved Script/outline   analysis, plan, extracted facts   change, or explicit Generate/Analyse action
                                                                     versions; genre/structure settings or Script delta referenced to     
                                                                     as applicable                      source elements                   

  audioSyncEngine                 Maintains frame/sample sync.       Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                                                     versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  audioRestorationEngine          Coordinates                        Approved Shot DNA + Scene DNA;     GenerationPackage, provider       Generate/Regenerate/Repair/Compare/Approve
                                  denoise/declick/dereverb/repair.   Character/wardrobe/prop/location   route/preflight, Take,            Take or provider capability/status change
                                                                     reference Asset versions; Project  provenance, repair plan or        
                                                                     provider/quality/cost policy       visual-QC result with             
                                                                                                        provider/model metadata           

  audioLoudnessEngine             Measures loudness/true peak.       Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                                                     versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  spatialAudioEngine              Calculates surround/spatial        Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  automation.                        versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  mixAutomationEngine             Creates editable automation        Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                  suggestions.                       versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  dialogueIntelligibilityEngine   Analyzes masking/intelligibility.  DialogueLine versions;             Versioned dialogue                Dialogue import/edit, Character DNA change,
                                                                     speaker/listener Character DNA;    annotations/alternative           explicit refine/analyse action, or Scene DNA
                                                                     scene context; relationship,       lines/performance beats/timing or preparation
                                                                     emotion and knowledge states       validation issues linked to       
                                                                                                        DialogueLine IDs                  

  stemPrintEngine                 Prints configured stems.           Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                                                     versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    

  mixMasterEngine                 Creates approved mix master.       Approved Dialogue/Scene/Shot       Audio cue/asset, sync data,       Audio-session setup/edit, picture update,
                                                                     versions; picture timing;          automation, mix/stem/master or    Generate/Conform/Mix/Print action, or
                                                                     Character Voice profiles; Audio    audio-QC report linked to         pre-delivery QC
                                                                     Assets; Project                    picture/timecode versions         
                                                                     sample-rate/layout/delivery rules                                    
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Editorial, Color & VFX

  --------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                     **Responsibility**   **Inputs**              **Outputs**                        **Trigger**
  ------------------------------ -------------------- ----------------------- ---------------------------------- -----------------------
  timelineConstructionEngine     Creates initial      Approved Takes;         Timeline edit/version,             Editorial action,
                                 assembly request.    Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  assemblyTimelineEngine         Builds canonical     Approved Takes;         Timeline edit/version,             Editorial action,
                                 editable timeline.   Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  editDecisionEngine             Maintains            Approved Takes;         Timeline edit/version,             Editorial action,
                                 edit-operation       Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                 semantics.           Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  dialogueDrivenEditEngine       Suggests             Project story brief;    Versioned story/structure          Story
                                 speaker/reaction     target runtime;         analysis, plan, extracted facts or setup/import/edit,
                                 coverage.            approved Script/outline Script delta referenced to source  Script version change,
                                                      versions;               elements                           or explicit
                                                      genre/structure                                            Generate/Analyse action
                                                      settings as applicable                                     

  pacingEditEngine               Analyzes cut rhythm. Project story brief;    Versioned story/structure          Story
                                                      target runtime;         analysis, plan, extracted facts or setup/import/edit,
                                                      approved Script/outline Script delta referenced to source  Script version change,
                                                      versions;               elements                           or explicit
                                                      genre/structure                                            Generate/Analyse action
                                                      settings as applicable                                     

  continuityEditEngine           Checks continuity    Approved Takes;         Timeline edit/version,             Editorial action,
                                 across edits.        Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  transitionIntelligenceEngine   Suggests motivated   Approved Takes;         Timeline edit/version,             Editorial action,
                                 transitions.         Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  colorMatchEngine               Analyzes             Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                                 shot-to-shot color   narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                 matching.            beats; blocking;        or cinematography validation       request, or Scene DNA
                                                      aspect/frame-rate       linked to Scene DNA version        revision
                                                      rules; cinematography                                      
                                                      preferences and                                            
                                                      reference Assets                                           

  colorManagementEngine          Applies project      Approved Takes;         Timeline edit/version,             Editorial action,
                                 color pipeline.      Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  shotGradeEngine                Stores per-shot      Approved Scene DNA;     Versioned Shot                     Generate/Edit/Approve
                                 grade state.         narrative/performance   DNA/storyboard/animatic/coverage   Shots, storyboard
                                                      beats; blocking;        or cinematography validation       request, or Scene DNA
                                                      aspect/frame-rate       linked to Scene DNA version        revision
                                                      rules; cinematography                                      
                                                      preferences and                                            
                                                      reference Assets                                           

  vfxConformEngine               Tracks/replaces VFX  Approved Takes;         Timeline edit/version,             Editorial action,
                                 versions             Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                 non-destructively.   Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  titleGraphicsEngine            Manages              Approved Takes;         Timeline edit/version,             Editorial action,
                                 titles/graphics      Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                 instances.           Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  subtitleTimelineEngine         Creates/edits        Approved Takes;         Timeline edit/version,             Editorial action,
                                 subtitle tracks.     Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  timelineVersionEngine          Branches/labels      Approved Takes;         Timeline edit/version,             Editorial action,
                                 timeline versions.   Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  pictureLockEngine              Validates/records    Approved Takes;         Timeline edit/version,             Editorial action,
                                 Picture Lock.        Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                                      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 

  editorialQCEngine              Checks gaps, flash   Approved Takes;         Timeline edit/version,             Editorial action,
                                 frames, offline/temp Shot/Scene metadata;    transition/color/VFX/subtitle      asset/version update,
                                 media and sync.      Audio mix/stems;        state, editorial-QC result or      review action, or
                                                      AssemblyTimeline        immutable PictureLock reference    Picture Lock request
                                                      version; Project                                           
                                                      color/timebase rules as                                    
                                                      applicable                                                 
  --------------------------------------------------------------------------------------------------------------------------------------

## Render, Delivery & Localization

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                       **Responsibility**               **Inputs**                    **Outputs**                                     **Trigger**
  -------------------------------- -------------------------------- ----------------------------- ----------------------------------------------- ---------------------------------
  renderManifestEngine             Creates immutable render         PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   specification.                   masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  renderDependencyResolverEngine   Resolves masters rather than     PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   proxies.                         masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  renderChunkPlannerEngine         Partitions long renders into     PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   resumable chunks.                masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  renderWorkerEngine               Executes render chunks.          PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                                                    masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  renderStitchEngine               Stitches validated chunks.       PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                                                    masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  encodeEngine                     Creates codec/container          PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   variants.                        masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  packageEngine                    Builds configured delivery       PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   packages.                        masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  subtitlePackagingEngine          Packages subtitles/captions.     Approved Takes; Shot/Scene    Timeline edit/version,                          Editorial action, asset/version
                                                                    metadata; Audio mix/stems;    transition/color/VFX/subtitle state,            update, review action, or Picture
                                                                    AssemblyTimeline version;     editorial-QC result or immutable PictureLock    Lock request
                                                                    Project color/timebase rules  reference                                       
                                                                    as applicable                                                                 

  localizationEngine               Coordinates language variants.   PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                                                    masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  dubbingAdaptationEngine          Adapts translated dialogue for   DialogueLine versions;        Versioned dialogue annotations/alternative      Dialogue import/edit, Character
                                   meaning/timing.                  speaker/listener Character    lines/performance beats/timing or validation    DNA change, explicit
                                                                    DNA; scene context;           issues linked to DialogueLine IDs               refine/analyse action, or Scene
                                                                    relationship, emotion and                                                     DNA preparation
                                                                    knowledge states                                                              

  alternateLanguageVoiceEngine     Creates language-specific voice  PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   assets.                          masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  finalQCEngine                    Runs master                      Approved Dialogue/Scene/Shot  Audio cue/asset, sync data, automation,         Audio-session setup/edit, picture
                                   picture/audio/subtitle/package   versions; picture timing;     mix/stem/master or audio-QC report linked to    update,
                                   QC.                              Character Voice profiles;     picture/timecode versions                       Generate/Conform/Mix/Print
                                                                    Audio Assets; Project                                                         action, or pre-delivery QC
                                                                    sample-rate/layout/delivery                                                   
                                                                    rules                                                                         

  deliveryProfileEngine            Maintains versioned delivery     PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   profiles.                        masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  deliveryComplianceEngine         Validates output against         PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   selected profile.                masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  archivePackageEngine             Builds project archive package.  PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                                                    masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  checksumIntegrityEngine          Calculates/verifies checksums.   PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                                                    masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 

  deliverableRegistryEngine        Registers final                  PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                                   outputs/provenance.              masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                                                                    subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                                    master Assets; Project                                                        
                                                                    delivery profile and metadata                                                 
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Collaboration, Assets & Platform

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                     **Responsibility**                    **Inputs**                         **Outputs**                                                     **Trigger**
  ------------------------------ ------------------------------------- ---------------------------------- --------------------------------------------------------------- --------------------------------------------
  rolePermissionEngine           Evaluates project/module/object       Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                 authorization.                        Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  assignmentEngine               Assigns scenes/shots/tasks.           Approved Scene DNA;                Versioned Shot DNA/storyboard/animatic/coverage or              Generate/Edit/Approve Shots, storyboard
                                                                       narrative/performance beats;       cinematography validation linked to Scene DNA version           request, or Scene DNA revision
                                                                       blocking; aspect/frame-rate rules;                                                                 
                                                                       cinematography preferences and                                                                     
                                                                       reference Assets                                                                                   

  taskWorkflowEngine             Manages task states/dependencies.     Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  reviewWorkflowEngine           Routes review/change/approval states. Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  approvalEngine                 Records authorized approval/lock.     Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  commentEngine                  Stores contextual version-aware       Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                 comments.                             Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  timecodeCommentEngine          Anchors comments to                   Approved Takes; Shot/Scene         Timeline edit/version, transition/color/VFX/subtitle state,     Editorial action, asset/version update,
                                 timeline/timecode.                    metadata; Audio mix/stems;         editorial-QC result or immutable PictureLock reference          review action, or Picture Lock request
                                                                       AssemblyTimeline version; Project                                                                  
                                                                       color/timebase rules as applicable                                                                 

  mentionNotificationEngine      Resolves mentions/notifications.      Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  activityFeedEngine             Builds activity stream.               Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                                                                       runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                                                                       versions; genre/structure settings                                                                 
                                                                       as applicable                                                                                      

  auditTrailEngine               Writes immutable audit events.        Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  presenceEngine                 Tracks ephemeral workspace presence.  Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  conflictDetectionEngine        Detects concurrent edit conflicts.    Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                                                                       runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                                                                       versions; genre/structure settings                                                                 
                                                                       as applicable                                                                                      

  impactAnalysisEngine           Computes downstream consequences.     Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                                                                       runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                                                                       versions; genre/structure settings                                                                 
                                                                       as applicable                                                                                      

  productionNotificationEngine   Filters meaningful notifications.     Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                                                       Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  assetIngestEngine              Registers media and starts derivative Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                 jobs.                                 object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  assetMetadataEngine            Extracts technical metadata.          Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                                                                       runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                                                                       versions; genre/structure settings                                                                 
                                                                       as applicable                                                                                      

  assetVersionEngine             Creates immutable asset lineage.      Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                                                       object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  assetUsageEngine               Builds reverse usage graph.           Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                                                       object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  assetRightsEngine              Stores                                Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                 licence/source/release/provenance.    object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  proxyGenerationEngine          Creates editing/preview proxies.      Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight, Take, provenance,  Generate/Regenerate/Repair/Compare/Approve
                                                                       Character/wardrobe/prop/location   repair plan or visual-QC result with provider/model metadata    Take or provider capability/status change
                                                                       reference Asset versions; Project                                                                  
                                                                       provider/quality/cost policy                                                                       

  thumbnailEngine                Creates thumbnails/posters/contact    Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                                 sheets.                               runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                                                                       versions; genre/structure settings                                                                 
                                                                       as applicable                                                                                      

  waveformEngine                 Creates waveform peak data.           Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                                                       object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  semanticAssetIndexEngine       Creates multimodal/text search        Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                 embeddings.                           object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  assetSearchEngine              Combines filters/full-text/semantic   Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                 retrieval.                            object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  duplicateAssetEngine           Detects identical/near-duplicate      Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                 assets.                               object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  assetIntegrityEngine           Verifies checksums/storage            PictureLock; approved audio        RenderManifest/chunk/output/package/localized                   Render/localize/package/archive request,
                                 availability.                         masters/stems;                     asset/QC/compliance result/Deliverable with checksums and       worker completion, or delivery-QC stage
                                                                       subtitle/localization tracks;      provenance                                                      
                                                                       master Assets; Project delivery                                                                    
                                                                       profile and metadata                                                                               

  assetLifecycleEngine           Applies archive/retention policy.     PictureLock; approved audio        RenderManifest/chunk/output/package/localized                   Render/localize/package/archive request,
                                                                       masters/stems;                     asset/QC/compliance result/Deliverable with checksums and       worker completion, or delivery-QC stage
                                                                       subtitle/localization tracks;      provenance                                                      
                                                                       master Assets; Project delivery                                                                    
                                                                       profile and metadata                                                                               

  signedAccessEngine             Issues scoped signed media URLs.      Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                                                       object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  DNACentralBrain                Coordinates DNA-domain dependency     Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                 awareness; owns no canonical truth.   references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  dependencyGraphEngine          Maintains typed dependency edges.     Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                                                       references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  readinessEngine                Evaluates readiness                   Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                 predicates/evidence.                  references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  idempotencyEngine              Prevents duplicate semantic work.     Asset/AssetVersion bytes or signed Asset metadata/derivative/index/usage/integrity/QC result       Asset ingest/version change, explicit
                                                                       object reference; technical        linked to AssetVersion and checksum                             analysis, media-QC job, search/index
                                                                       metadata; usage/rights context;                                                                    refresh, or authorized access request
                                                                       target analysis parameters                                                                         

  jobSchedulerEngine             Queues by                             Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                 workload/priority/quota/dependency.   references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  retryPolicyEngine              Applies typed bounded retry/backoff.  Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                                                       references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  providerFallbackEngine         Selects permitted compatible          Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight, Take, provenance,  Generate/Regenerate/Repair/Compare/Approve
                                 fallback.                             Character/wardrobe/prop/location   repair plan or visual-QC result with provider/model metadata    Take or provider capability/status change
                                                                       reference Asset versions; Project                                                                  
                                                                       provider/quality/cost policy                                                                       

  quotaBudgetEngine              Enforces cost/generation limits.      Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight, Take, provenance,  Generate/Regenerate/Repair/Compare/Approve
                                                                       Character/wardrobe/prop/location   repair plan or visual-QC result with provider/model metadata    Take or provider capability/status change
                                                                       reference Asset versions; Project                                                                  
                                                                       provider/quality/cost policy                                                                       

  costLedgerEngine               Records estimated/actual costs.       Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                                                                       runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                                                                       versions; genre/structure settings                                                                 
                                                                       as applicable                                                                                      

  engineTelemetryEngine          Captures run                          Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight, Take, provenance,  Generate/Regenerate/Repair/Compare/Approve
                                 duration/tokens/provider/errors.      Character/wardrobe/prop/location   repair plan or visual-QC result with provider/model metadata    Take or provider capability/status change
                                                                       reference Asset versions; Project                                                                  
                                                                       provider/quality/cost policy                                                                       

  staleStateEngine               Marks descendants                     Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                                 stale/review-required.                Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                                       object/version; workflow state and                                                                 approved change
                                                                       requested action                                                                                   

  eventOutboxEngine              Reliably publishes committed domain   Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                 events.                               references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  workflowStateMachineEngine     Enforces legal object transitions.    Approved Takes; Shot/Scene         Timeline edit/version, transition/color/VFX/subtitle state,     Editorial action, asset/version update,
                                                                       metadata; Audio mix/stems;         editorial-QC result or immutable PictureLock reference          review action, or Picture Lock request
                                                                       AssemblyTimeline version; Project                                                                  
                                                                       color/timebase rules as applicable                                                                 

  diagnosticEngine               Aggregates support diagnostics.       Authenticated user permissions;    Contextual guidance, diagnostic summary, navigation target or   Help query, diagnostic request,
                                                                       current workspace/object IDs;      support-ticket context without unauthorized production content  support-ticket creation or detected
                                                                       knowledge base; safe                                                                               actionable failure
                                                                       job/provider/system telemetry                                                                      

  healthStatusEngine             Computes platform health from         Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                 telemetry.                            references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               

  featureFlagEngine              Controls staged rollout/model         Typed canonical object/version     Typed versioned decision/state/report with evidence,            Explicit domain action or subscribed domain
                                 enablement.                           references; authenticated context; source-version lineage and telemetry                            event after readiness validation
                                                                       engine configuration                                                                               
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Security & Governance

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                  **Responsibility**      **Inputs**                         **Outputs**                                    **Trigger**
  --------------------------- ----------------------- ---------------------------------- ---------------------------------------------- --------------------------------------------
  tenantIsolationEngine       Enforces                Authenticated actor/service;       Allow/deny decision, scoped credential,        Protected request, provider call, webhook,
                              organization/project    tenant/project policy; target      retention/export action, verified webhook or   policy evaluation, retention schedule or
                              tenant boundaries.      resource/action;                   governance finding with audit evidence         rights preflight
                                                      rights/consent/security                                                           
                                                      configuration                                                                     

  contentAccessPolicyEngine   Evaluates asset/script  Asset/AssetVersion bytes or signed Asset                                          Asset ingest/version change, explicit
                              access policies.        object reference; technical        metadata/derivative/index/usage/integrity/QC   analysis, media-QC job, search/index
                                                      metadata; usage/rights context;    result linked to AssetVersion and checksum     refresh, or authorized access request
                                                      target analysis parameters                                                        

  secretVaultBrokerEngine     Provides scoped         Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,   Generate/Regenerate/Repair/Compare/Approve
                              provider credentials to Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC     Take or provider capability/status change
                              workers.                reference Asset versions; Project  result with provider/model metadata            
                                                      provider/quality/cost policy                                                      

  dataRetentionEngine         Applies organization    Authenticated actor/service;       Allow/deny decision, scoped credential,        Protected request, provider call, webhook,
                              retention/deletion      tenant/project policy; target      retention/export action, verified webhook or   policy evaluation, retention schedule or
                              policy.                 resource/action;                   governance finding with audit evidence         rights preflight
                                                      rights/consent/security                                                           
                                                      configuration                                                                     

  privacyExportEngine         Builds authorized       Authenticated actor/service;       Allow/deny decision, scoped credential,        Protected request, provider call, webhook,
                              user/project data       tenant/project policy; target      retention/export action, verified webhook or   policy evaluation, retention schedule or
                              exports.                resource/action;                   governance finding with audit evidence         rights preflight
                                                      rights/consent/security                                                           
                                                      configuration                                                                     

  abuseRateLimitEngine        Applies abuse/rate      Authenticated actor/service;       Allow/deny decision, scoped credential,        Protected request, provider call, webhook,
                              controls to public/API  tenant/project policy; target      retention/export action, verified webhook or   policy evaluation, retention schedule or
                              endpoints.              resource/action;                   governance finding with audit evidence         rights preflight
                                                      rights/consent/security                                                           
                                                      configuration                                                                     

  webhookSignatureEngine      Signs/verifies external Authenticated actor/service;       Allow/deny decision, scoped credential,        Protected request, provider call, webhook,
                              webhook payloads.       tenant/project policy; target      retention/export action, verified webhook or   policy evaluation, retention schedule or
                                                      resource/action;                   governance finding with audit evidence         rights preflight
                                                      rights/consent/security                                                           
                                                      configuration                                                                     

  consentReleaseEngine        Tracks                  Authenticated actor/service;       Allow/deny decision, scoped credential,        Protected request, provider call, webhook,
                              performer/voice/image   tenant/project policy; target      retention/export action, verified webhook or   policy evaluation, retention schedule or
                              release records.        resource/action;                   governance finding with audit evidence         rights preflight
                                                      rights/consent/security                                                           
                                                      configuration                                                                     

  modelUsagePolicyEngine      Enforces provider/model Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,   Generate/Regenerate/Repair/Compare/Approve
                              restrictions by         Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC     Take or provider capability/status change
                              project.                reference Asset versions; Project  result with provider/model metadata            
                                                      provider/quality/cost policy                                                      

  rightsPreflightEngine       Checks asset rights     Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight,   Generate/Regenerate/Repair/Compare/Approve
                              restrictions before     Character/wardrobe/prop/location   Take, provenance, repair plan or visual-QC     Take or provider capability/status change
                              generation/export.      reference Asset versions; Project  result with provider/model metadata            
                                                      provider/quality/cost policy                                                      
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Localization

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                   **Responsibility**   **Inputs**                    **Outputs**                                     **Trigger**
  ---------------------------- -------------------- ----------------------------- ----------------------------------------------- ---------------------------------
  translationEngine            Creates translation  DialogueLine versions;        Versioned dialogue annotations/alternative      Dialogue import/edit, Character
                               drafts preserving    speaker/listener Character    lines/performance beats/timing or validation    DNA change, explicit
                               structured dialogue  DNA; scene context;           issues linked to DialogueLine IDs               refine/analyse action, or Scene
                               IDs.                 relationship, emotion and                                                     DNA preparation
                                                    knowledge states                                                              

  translationQCEngine          Checks omissions,    PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                               terminology and      masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                               timing constraints.  subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                                                    master Assets; Project                                                        
                                                    delivery profile and metadata                                                 

  subtitleSegmentationEngine   Segments dialogue    DialogueLine versions;        Versioned dialogue annotations/alternative      Dialogue import/edit, Character
                               into readable        speaker/listener Character    lines/performance beats/timing or validation    DNA change, explicit
                               subtitle events.     DNA; scene context;           issues linked to DialogueLine IDs               refine/analyse action, or Scene
                                                    relationship, emotion and                                                     DNA preparation
                                                    knowledge states                                                              

  captionAccessibilityEngine   Adds SDH/non-speech  Approved Dialogue/Scene/Shot  Audio cue/asset, sync data, automation,         Audio-session setup/edit, picture
                               accessibility        versions; picture timing;     mix/stem/master or audio-QC report linked to    update,
                               annotations.         Character Voice profiles;     picture/timecode versions                       Generate/Conform/Mix/Print
                                                    Audio Assets; Project                                                         action, or pre-delivery QC
                                                    sample-rate/layout/delivery                                                   
                                                    rules                                                                         

  pronunciationLexiconEngine   Maintains            PictureLock; approved audio   RenderManifest/chunk/output/package/localized   Render/localize/package/archive
                               names/places/terms   masters/stems;                asset/QC/compliance result/Deliverable with     request, worker completion, or
                               pronunciation        subtitle/localization tracks; checksums and provenance                        delivery-QC stage
                               lexicon.             master Assets; Project                                                        
                                                    delivery profile and metadata                                                 

  readingSpeedEngine           Measures subtitle    Approved Takes; Shot/Scene    Timeline edit/version,                          Editorial action, asset/version
                               reading speed and    metadata; Audio mix/stems;    transition/color/VFX/subtitle state,            update, review action, or Picture
                               line constraints.    AssemblyTimeline version;     editorial-QC result or immutable PictureLock    Lock request
                                                    Project color/timebase rules  reference                                       
                                                    as applicable                                                                 
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------

## Media Analysis

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                    **Responsibility**         **Inputs**                    **Outputs**                                    **Trigger**
  ----------------------------- -------------------------- ----------------------------- ---------------------------------------------- ----------------------------
  videoMetadataEngine           Extracts duration, codec,  Project story brief; target   Versioned story/structure analysis, plan,      Story setup/import/edit,
                                fps, resolution and color  runtime; approved             extracted facts or Script delta referenced to  Script version change, or
                                metadata.                  Script/outline versions;      source elements                                explicit Generate/Analyse
                                                           genre/structure settings as                                                  action
                                                           applicable                                                                   

  audioMetadataEngine           Extracts sample rate,      Project story brief; target   Versioned story/structure analysis, plan,      Story setup/import/edit,
                                channels, loudness and     runtime; approved             extracted facts or Script delta referenced to  Script version change, or
                                duration metadata.         Script/outline versions;      source elements                                explicit Generate/Analyse
                                                           genre/structure settings as                                                  action
                                                           applicable                                                                   

  frameExtractionEngine         Extracts deterministic     Project story brief; target   Versioned story/structure analysis, plan,      Story setup/import/edit,
                                frames/contact sheets for  runtime; approved             extracted facts or Script delta referenced to  Script version change, or
                                analysis.                  Script/outline versions;      source elements                                explicit Generate/Analyse
                                                           genre/structure settings as                                                  action
                                                           applicable                                                                   

  shotBoundaryDetectionEngine   Detects shot boundaries in Approved Scene DNA;           Versioned Shot                                 Generate/Edit/Approve Shots,
                                imported footage.          narrative/performance beats;  DNA/storyboard/animatic/coverage or            storyboard request, or Scene
                                                           blocking; aspect/frame-rate   cinematography validation linked to Scene DNA  DNA revision
                                                           rules; cinematography         version                                        
                                                           preferences and reference                                                    
                                                           Assets                                                                       

  faceTrackReferenceEngine      Tracks approved character  Project story brief; target   Versioned story/structure analysis, plan,      Story setup/import/edit,
                                reference regions for QC   runtime; approved             extracted facts or Script delta referenced to  Script version change, or
                                without becoming identity  Script/outline versions;      source elements                                explicit Generate/Analyse
                                authority.                 genre/structure settings as                                                  action
                                                           applicable                                                                   

  objectTrackEngine             Tracks relevant            Script story facts;           Versioned world/location/environment/prop      Story-fact extraction,
                                props/objects for          World/Location/Prop records;  state, topology or continuity report with      world/location edit, Scene
                                continuity QC.             chronology; Scene context;    source references                              DNA generation, or
                                                           approved reference Assets                                                    continuity validation

  motionAnalysisEngine          Measures motion/camera     Project story brief; target   Versioned story/structure analysis, plan,      Story setup/import/edit,
                                characteristics for QC.    runtime; approved             extracted facts or Script delta referenced to  Script version change, or
                                                           Script/outline versions;      source elements                                explicit Generate/Analyse
                                                           genre/structure settings as                                                  action
                                                           applicable                                                                   

  blackFlashFrameEngine         Detects                    Asset/AssetVersion bytes or   Asset                                          Asset ingest/version change,
                                black/flash/frozen-frame   signed object reference;      metadata/derivative/index/usage/integrity/QC   explicit analysis, media-QC
                                anomalies.                 technical metadata;           result linked to AssetVersion and checksum     job, search/index refresh,
                                                           usage/rights context; target                                                 or authorized access request
                                                           analysis parameters                                                          

  audioDropoutEngine            Detects silence/dropout    Approved Dialogue/Scene/Shot  Audio cue/asset, sync data, automation,        Audio-session setup/edit,
                                anomalies.                 versions; picture timing;     mix/stem/master or audio-QC report linked to   picture update,
                                                           Character Voice profiles;     picture/timecode versions                      Generate/Conform/Mix/Print
                                                           Audio Assets; Project                                                        action, or pre-delivery QC
                                                           sample-rate/layout/delivery                                                  
                                                           rules                                                                        

  syncDriftEngine               Measures A/V sync drift.   Asset/AssetVersion bytes or   Asset                                          Asset ingest/version change,
                                                           signed object reference;      metadata/derivative/index/usage/integrity/QC   explicit analysis, media-QC
                                                           technical metadata;           result linked to AssetVersion and checksum     job, search/index refresh,
                                                           usage/rights context; target                                                 or authorized access request
                                                           analysis parameters                                                          
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Planning

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Engine**                  **Responsibility**        **Inputs**                         **Outputs**                                                     **Trigger**
  --------------------------- ------------------------- ---------------------------------- --------------------------------------------------------------- --------------------------------------------
  productionMilestoneEngine   Computes stage milestones Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                              from dependencies/tasks.  Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                        object/version; workflow state and                                                                 approved change
                                                        requested action                                                                                   

  departmentLoadEngine        Summarizes assignment     Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                              load by department/user.  Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                                                        object/version; workflow state and                                                                 approved change
                                                        requested action                                                                                   

  criticalPathEngine          Computes dependency       Authenticated actor;               Authorization/workflow/task/review/comment/notification/audit   User collaboration action, domain state
                              critical path for         Organization/Project role; target  or impact-analysis record                                       transition, mention/event, or upstream
                              production tasks.         object/version; workflow state and                                                                 approved change
                                                        requested action                                                                                   

  renderCapacityEngine        Estimates render-worker   PictureLock; approved audio        RenderManifest/chunk/output/package/localized                   Render/localize/package/archive request,
                              capacity/time.            masters/stems;                     asset/QC/compliance result/Deliverable with checksums and       worker completion, or delivery-QC stage
                                                        subtitle/localization tracks;      provenance                                                      
                                                        master Assets; Project delivery                                                                    
                                                        profile and metadata                                                                               

  storageForecastEngine       Forecasts storage from    Project story brief; target        Versioned story/structure analysis, plan, extracted facts or    Story setup/import/edit, Script version
                              runtime/resolution/take   runtime; approved Script/outline   Script delta referenced to source elements                      change, or explicit Generate/Analyse action
                              policy.                   versions; genre/structure settings                                                                 
                                                        as applicable                                                                                      

  costForecastEngine          Forecasts                 Approved Shot DNA + Scene DNA;     GenerationPackage, provider route/preflight, Take, provenance,  Generate/Regenerate/Repair/Compare/Approve
                              provider/compute spend    Character/wardrobe/prop/location   repair plan or visual-QC result with provider/model metadata    Take or provider capability/status change
                              from production plan.     reference Asset versions; Project                                                                  
                                                        provider/quality/cost policy                                                                       
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Help & Support

  -------------------------------------------------------------------------------------------------------
  **Engine**                 **Responsibility**   **Inputs**            **Outputs**      **Trigger**
  -------------------------- -------------------- --------------------- ---------------- ----------------
  contextHelpEngine          Maps current         Authenticated user    Contextual       Help query,
                             workspace/object to  permissions; current  guidance,        diagnostic
                             relevant             workspace/object IDs; diagnostic       request,
                             documentation.       knowledge base; safe  summary,         support-ticket
                                                  job/provider/system   navigation       creation or
                                                  telemetry             target or        detected
                                                                        support-ticket   actionable
                                                                        context without  failure
                                                                        unauthorized     
                                                                        production       
                                                                        content          

  supportDiagnosticEngine    Creates              Authenticated user    Contextual       Help query,
                             permission-safe      permissions; current  guidance,        diagnostic
                             diagnostic           workspace/object IDs; diagnostic       request,
                             summaries.           knowledge base; safe  summary,         support-ticket
                                                  job/provider/system   navigation       creation or
                                                  telemetry             target or        detected
                                                                        support-ticket   actionable
                                                                        context without  failure
                                                                        unauthorized     
                                                                        production       
                                                                        content          

  knowledgeRetrievalEngine   Retrieves relevant   Authenticated user    Contextual       Help query,
                             product/filmmaking   permissions; current  guidance,        diagnostic
                             guidance.            workspace/object IDs; diagnostic       request,
                                                  knowledge base; safe  summary,         support-ticket
                                                  job/provider/system   navigation       creation or
                                                  telemetry             target or        detected
                                                                        support-ticket   actionable
                                                                        context without  failure
                                                                        unauthorized     
                                                                        production       
                                                                        content          

  ticketContextEngine        Attaches             Authenticated user    Contextual       Help query,
                             user-approved        permissions; current  guidance,        diagnostic
                             diagnostic context   workspace/object IDs; diagnostic       request,
                             to tickets.          knowledge base; safe  summary,         support-ticket
                                                  job/provider/system   navigation       creation or
                                                  telemetry             target or        detected
                                                                        support-ticket   actionable
                                                                        context without  failure
                                                                        unauthorized     
                                                                        production       
                                                                        content          
  -------------------------------------------------------------------------------------------------------

# 16. Mathematical and Algorithmic Models

  -------------------------------------------------------------------------------
  **Model**                           **Specification / use**
  ----------------------------------- -------------------------------------------
  Runtime scope                       N_scene ≈ R/μ_scene; μ_scene is a
                                      configurable project prior. Act/sequence
                                      allocations sum to target runtime within
                                      tolerance.

  Character presence                  Logistic/confidence fusion over hard
                                      screenplay cues, action mentions,
                                      entrance/exit, aliases and coreference;
                                      hard cues override threshold.

  Entity resolution                   Weighted similarity over normalized names,
                                      aliases, role semantics, co-occurrence and
                                      dialogue evidence; merges require
                                      confidence or human confirmation.

  Coverage                            C = measure(union of mandatory story-time
                                      intervals covered) / T_scene. Alternate
                                      source footage may exceed story duration.

  Readiness                           Boolean predicate graph with evidence, not
                                      arbitrary percentages. Dashboard percentage
                                      = weighted completed predicates /
                                      applicable predicate weight.

  Continuity                          State transition comparison Sᵈ_t against
                                      previous approved state; classify expected,
                                      explained, intentional override or
                                      conflict.

  Impact priority                     I = Σ criticality × dependency strength ×
                                      recomputation cost × approval weight.

  Asset similarity                    Hybrid ranking: structured filter + lexical
                                      score + embedding similarity +
                                      usage/approval boosts.

  Provider routing                    Constrained optimization over capability
                                      compatibility, policy, quality estimate,
                                      cost, latency, availability and user
                                      preference.

  Cost                                Estimated cost = provider unit price ×
                                      units
                                      (tokens/images/seconds/minutes/compute) +
                                      internal compute/storage estimates; actual
                                      ledger reconciles after completion.

  Loudness                            EBU/ITU-style loudness/true-peak
                                      measurement through validated audio
                                      tooling; target is selected by delivery
                                      profile, not hardcoded globally.

  Subtitle readability                Characters/words per second plus
                                      line-count/line-length constraints defined
                                      by delivery profile/language.

  Render chunking                     Partition at safe edit/GOP/scene boundaries
                                      with overlap/validation where necessary;
                                      final checksum and continuity validation
                                      after stitch.
  -------------------------------------------------------------------------------

# 17. External APIs and Integrations

The provider list is an integration catalogue, not a mandate to purchase
every service. Exact models, prices and terms change; adapters and
capability discovery must prevent vendor lock-in. Production should
begin with the minimum providers required for MVP, then add
alternatives.

  --------------------------------------------------------------------------------------------------------------
  **API / service**          **Capability**                   **AuraStage use**            **Engineering note**
  -------------------------- -------------------------------- ---------------------------- ---------------------
  OpenAI API                 Reasoning/text, structured       Script/dialogue/Scene/shot   Server-side only;
                             outputs, multimodal analysis;    assistance; analysis;        adapter; schema
                             optional image/audio             optional generation          validation; usage
                             capabilities depending selected                               ledger
                             models                                                        

  Anthropic API              Alternative                      Story/analysis fallback or   Server-side adapter
                             reasoning/long-context provider  preferred reasoning provider 

  Google Gemini API          Alternative multimodal/reasoning Multimodal analysis/provider Server-side adapter
                             provider                         diversity                    

  Runway API                 Video/image generation where     Visual Generation Takes      Async webhook/poll
                             commercial API capability is                                  adapter; capability
                             available                                                     limits

  Luma API                   Generative video/image option    Visual Generation            Provider adapter
                                                              alternative                  

  Kling API / authorized     Generative video option where    Visual Generation            Do not rely on
  provider                   official/authorized API access   alternative                  unofficial scraping
                             is available                                                  

  fal.ai                     Hosted model gateway for         Provider breadth and         Per-model capability
                             image/video/audio models         specialized models           adapter

  Replicate                  Hosted model inference           Fallback/specialized open    Per-model adapter
                                                              models                       

  ElevenLabs API             TTS/voice/speech-to-speech/SFX   ADR/VO/character voice/audio Voice rights/consent
                             depending enabled services       generation                   controls; server-side

  Deepgram API               Speech-to-text/alignment         Transcription, captions,     Timecoded output
                                                              dialogue conform assistance  

  AssemblyAI API             Alternative STT/audio            Transcription/caption        Adapter
                             intelligence                     fallback                     

  Suno API / authorized      Music generation if              Score/source-music           Licensing/terms must
  integration                official/contracted access is    prototyping                  be verified before
                             available                                                     production use

  MusicGen/self-hosted or    Music generation alternative     Score prototyping            GPU/rights
  licensed music provider                                                                  considerations

  HeyGen API                 Avatar/lip-sync/video services   Optional                     Not core dependency
                             where appropriate                lip-sync/presenter-style     
                                                              services                     

  Sync Labs API              Lip-sync / dubbing               Dialogue-to-picture          Async adapter
                             synchronization                  synchronization              

  Topaz Video AI / licensed  Upscale/denoise/restore where    Finishing/repair             May require
  SDK or service             automatable licensing permits                                 workstation/service
                                                                                           integration

  Cloudflare R2 / AWS S3 /   Object storage                   Masters, proxies,            Signed URLs,
  GCS                                                         references, renders          lifecycle, checksums

  Cloudflare CDN /           Media delivery                   Preview/proxy distribution   Private signed
  CloudFront                                                                               delivery

  Stripe API                 Subscription/billing if          Plans, invoices, usage       Webhook verification;
                             commercial SaaS billing is       billing                      no card storage
                             enabled                                                       

  Resend / SendGrid /        Transactional email              Invites, approvals,          Template +
  Postmark                                                    job/support notifications    suppression
                                                                                           management

  Sentry                     Application error monitoring     Frontend/backend exception   Scrub sensitive
                                                              diagnostics                  content

  OpenTelemetry-compatible   Tracing/metrics                  Distributed job/provider     Trace IDs across
  backend                                                     observability                MOS/workers

  Auth0 / Clerk / Supabase   Authentication                   Users, SSO, MFA depending    Authorization remains
  Auth / custom OIDC                                          plan                         application-side

  Frame.io API (optional)    External review/delivery         Review/export                Optional; AuraStage
                             integration                      interoperability             has native review

  YouTube Data API           Direct publishing only if user   Web/social delivery          OAuth scopes;
                             explicitly connects account                                   optional

  Vimeo API                  External review/publishing       Delivery integration         OAuth; optional
  --------------------------------------------------------------------------------------------------------------

## 17.1 Local/open-source infrastructure

-   FFmpeg/ffprobe: transcode, mux/demux, proxy, frame extraction,
    audio/video QC primitives.

-   OpenColorIO: color-management configuration where suitable.

-   OpenTimelineIO: interchange/serialization assistance for editorial
    timelines.

-   OpenEXR/ImageMagick-class tooling: image pipeline where suitable.

-   PostgreSQL + pgvector: canonical data + semantic index at early
    scale.

-   Redis: queues/cache/ephemeral presence at early scale.

-   Object-storage multipart upload with checksums and resumability.

## 17.2 API governance

-   Never call third-party providers directly from browser with secret
    credentials.

-   Store provider credentials in a secrets manager; workers receive
    short-lived/scoped access.

-   Persist provider model/version/request ID and capability snapshot
    with every Take.

-   Webhook endpoints verify signatures and are idempotent.

-   A provider outage must not corrupt canonical production state.

-   Terms/licensing/voice/likeness rights must be reviewed before
    enabling a provider in production.

# 18. Security, Multi-Tenancy and Governance

-   Organization → Project → Object authorization hierarchy with
    server-side enforcement.

-   RBAC plus object-level attributes for sensitive departments/objects.

-   MFA/SSO options for studio plans; session revocation and
    device/session visibility.

-   Encryption in transit and at rest; secrets separated from
    application data.

-   Signed short-lived asset URLs; private buckets by default.

-   Immutable audit trail for approvals, locks, rights and critical
    changes.

-   Voice/likeness consent/release records and project policy
    enforcement.

-   Data retention/export/deletion workflows; backups and tested
    restoration.

-   Prompt/log redaction rules to prevent screenplay/media leakage into
    diagnostics.

-   Support assistant is permission-constrained and cannot use hidden
    cross-project context.

# 19. Storage, Search and Media Engineering

  -----------------------------------------------------------------------
  **Store**                           **Use**
  ----------------------------------- -----------------------------------
  PostgreSQL                          Canonical entities, versions,
                                      relationships, permissions, jobs,
                                      audit metadata.

  Object storage                      Original/master media, proxies,
                                      thumbnails, waveforms, renders,
                                      documents.

  Redis/queue                         Jobs, short-lived locks, rate
                                      limits, presence and cache.

  Vector/search index                 Semantic asset/document retrieval;
                                      never canonical truth.

  Graph projection (optional)         Fast impact/relationship traversal
                                      when relational dependency queries
                                      become insufficient.
  -----------------------------------------------------------------------

Asset derivatives follow Master → Mezzanine → Editing Proxy →
Preview/Thumbnail. Final renders resolve master-quality sources, not
editing proxies.

# 20. Reliability, Observability and Cost Control

-   Every EngineRun has trace_id, job_id, engine/version, source version
    IDs, provider request ID, duration, retries, token/media units,
    estimated/actual cost and output IDs.

-   Worker heartbeat detects abandoned jobs; resumable media jobs
    checkpoint at safe boundaries.

-   Dead-letter queue for non-retryable/exhausted failures;
    human-readable remediation.

-   Provider circuit breakers prevent repeated calls during degradation.

-   Project/organization budget ceilings and warning thresholds before
    expensive generations.

-   Dashboard and Help status derive from telemetry; no hardcoded green
    indicators.

-   Backups: point-in-time database recovery plus versioned object
    storage; restoration is periodically tested.

# 21. Testing and Acceptance Criteria

  -----------------------------------------------------------------------
  **Area**                            **Acceptance test**
  ----------------------------------- -----------------------------------
  Canonical authority                 Changing runtime in Scriptwriter
                                      updates inherited display
                                      everywhere without creating a
                                      second runtime field.

  Character extraction                Aliases resolve idempotently;
                                      rerunning extraction does not
                                      duplicate characters.

  Scene participation                 Dialogue speakers/entrances are
                                      included; off-screen speakers are
                                      distinguished; ambiguous
                                      coreference requests review.

  Scene DNA                           Locked version records exact
                                      upstream versions and cannot
                                      silently mutate.

  Invalidation                        Changing approved wardrobe marks
                                      dependent Shot/Take work
                                      stale/review-required without
                                      deleting it.

  Shot generation                     Generate Shots verifies readiness,
                                      creates canonical Shot records,
                                      dependency edges and job telemetry.

  Generation                          Every Take has provenance,
                                      provider/model metadata and source
                                      versions.

  Audio                               Timeline stays frame/sample
                                      synchronized after picture update;
                                      stale sync is surfaced.

  Editorial                           Picture Lock cannot be replaced
                                      silently; break-lock action records
                                      approval/impact.

  Export                              RenderManifest is immutable; final
                                      output can be traced to all source
                                      versions.

  Permissions                         Reviewer cannot edit/approve
                                      outside assigned permissions; Help
                                      assistant cannot bypass this.

  Assets                              Replacing used asset creates
                                      version/impact workflow rather than
                                      destructive overwrite.

  Reliability                         Duplicate webhook/job requests
                                      remain idempotent.

  Status                              Readiness/progress/status
                                      indicators can be explained by
                                      underlying evidence.
  -----------------------------------------------------------------------

# 22. Implementation Roadmap for Claude or Engineering Team

  -----------------------------------------------------------------------
  **Phase**                           **Deliverable**
  ----------------------------------- -----------------------------------
  Phase 0 --- Repository & ADRs       Monorepo/repositories,
                                      environments, coding standards,
                                      schema migration discipline,
                                      secrets, CI/CD, observability
                                      skeleton.

  Phase 1 --- Foundation              Auth/org/project, Project Settings
                                      authority split, PostgreSQL schema,
                                      object storage, Asset ingest,
                                      audit, outbox, MOS job skeleton.

  Phase 2 --- Scriptwriter            Structured screenplay
                                      editor/import, runtime scope,
                                      versions, scenes/facts/character
                                      candidate extraction.

  Phase 3 --- Casting & Dialogue      Character
                                      canonicalization/DNA/state,
                                      assets/wardrobe, DialogueLine
                                      intelligence and approvals.

  Phase 4 --- Scene DNA               Scene synthesis, continuity,
                                      readiness, dependencies,
                                      version/approval/impact analysis.

  Phase 5 --- Storyboard & Shots      Shot DNA, coverage, camera
                                      controls, storyboard frames,
                                      animatic.

  Phase 6 --- Provider Gateway &      GenerationPackage compiler,
  Visual Generation                   adapters, Takes, QC, comparison,
                                      approval, cost ledger.

  Phase 7 --- Audio Studio            Audio asset ingest, multitrack
                                      session model, waveform UI,
                                      routing/mixer,
                                      ADR/voice/Foley/SFX/music, stems.

  Phase 8 --- Editorial               NLE timeline model/UI, proxies,
                                      first assembly, review/timecode
                                      comments, color/VFX foundations,
                                      Picture Lock.

  Phase 9 --- Export & Localization   Render manifests, distributed
                                      workers, subtitles/dubbing, QC,
                                      delivery profiles, archive.

  Phase 10 --- Collaboration &        Granular permissions, review
  Support hardening                   queues, notifications, contextual
                                      Help diagnostics.

  Phase 11 --- Scale/Studio hardening Performance, GPU scheduling,
                                      disaster recovery, enterprise SSO,
                                      advanced interchange, security
                                      review, load testing.
  -----------------------------------------------------------------------

## 22.1 Build discipline

-   Do not build all 250+ engines as microservices. Engines are logical
    typed modules; co-locate them in domain services until scale
    justifies separation.

-   Do not start with every provider. Implement the Provider Gateway and
    1--2 providers per critical capability, then expand.

-   Do not build expensive generation before canonical
    data/version/dependency foundations; otherwise continuity becomes
    unfixable technical debt.

-   Each phase ends with executable acceptance tests and a working
    vertical slice.

-   Claude should be given one phase plus the relevant schemas/contracts
    at a time; generated code must be reviewed, tested and committed
    through normal engineering controls.

# 23. Worked End-to-End Scene Example

Example flow (illustrative, not a fixed story): an approved screenplay
scene contains two characters meeting on a Lagos rooftop at night. One
reveals evidence on a phone; the other reacts before replying.

1\. Scriptwriter stores the structured scene, action, dialogue and
chronology. Character candidates and phone/location facts are linked to
screenplay evidence.

2\. Casting resolves both canonical Character IDs and approved
visual/wardrobe states.

3\. Dialogue Intelligence records each line's speaker, listener,
intention, subtext, emotional intensity and knowledge prerequisites.

4\. Scene DNA resolves rooftop LocationDNA, night/weather/environment,
both CharacterStates, phone PropState, blocking, eyelines, lighting
intent, sound intent and continuity anchors.

5\. Shot Intelligence creates a master, OTS coverage, phone insert and
reaction close-up because the reveal/reaction are mandatory beats. The
cinematographer can alter any choice.

6\. Prompt Composition compiles each approved Shot with exact character,
wardrobe, location, prop, storyboard and continuity references plus
technical constraints.

7\. Visual Generation creates multiple Takes. QC flags
identity/prop/environment drift. The director approves selected Takes.

8\. Audio Studio conforms dialogue/ADR, adds rooftop ambience, wind,
clothing movement, phone handling, score cue and mixes through
DX/FX/BG/MX routing.

9\. Editorial assembles approved coverage, chooses the reaction timing,
performs color/VFX finishing and receives timecoded review notes.

10\. Picture Lock freezes the approved timeline version. Export creates
a RenderManifest, resolves master assets, renders, packages
subtitles/audio variants and runs QC.

11\. If the phone prop is later changed upstream, Impact Analysis
identifies Scene DNA, affected Shots/Takes, Foley cues and timeline
uses; nothing is silently deleted.

# 24. Final Engineering Rules

-   Canonical truth beats convenience.

-   Version references are explicit.

-   AI output is a proposal until the workflow says otherwise.

-   Continuity is state over story time, not just image similarity.

-   Scene DNA synthesizes; Shot DNA cinematizes; Generation executes;
    Editorial decides.

-   Audio is a professional production domain, not an afterthought.

-   Every expensive action is asynchronous, idempotent, observable and
    cost-accounted.

-   Every readiness state has evidence.

-   Every important change has impact analysis.

-   Every deliverable is traceable back to the exact production versions
    that created it.
