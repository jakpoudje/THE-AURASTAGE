**THE AURASTAGE**

**Claude + GitHub Modular Build Instructions**

Mandatory repository architecture for implementation, debugging,
maintenance and future engineering teams

Version 1.0 • 25 September 2026

# 1. Instruction to Claude

Build The AuraStage as a modular monolith with strict domain boundaries.
Do NOT build the application as one large file, one giant page
component, one giant service, or hundreds of microservices. The
repository must be hierarchical so any defect can be traced from page →
component → API/domain service → engine → canonical data →
worker/provider.

-   Every top-level AuraStage workspace gets its own frontend module.

-   Every production domain gets its own backend module.

-   AI/deterministic engines live outside page components and expose
    typed contracts.

-   Cross-domain communication uses shared contracts, canonical IDs and
    domain events.

-   Provider code is isolated behind a Provider Gateway.

-   Heavy asynchronous media work runs in workers through MOS.

-   Each module has a README describing ownership, dependencies, engines
    and tests.

-   Claude must modify the smallest responsible module and report every
    changed file.

# 2. Required GitHub Repository Structure

> aurastage/\
> ├── CLAUDE.md\
> ├── README.md\
> ├── docs/\
> │ ├── SRS/\
> │ ├── architecture/\
> │ │ ├── MODULE_REGISTRY.md\
> │ │ ├── PRODUCTION_GRAPH.md\
> │ │ └── DATA_AUTHORITY.md\
> │ └── ADR/\
> ├── apps/\
> │ ├── web/src/\
> │ │ ├── modules/\
> │ │ │ ├── home/\
> │ │ │ ├── dashboard/\
> │ │ │ ├── scriptwriter/\
> │ │ │ ├── casting-characters/\
> │ │ │ ├── dialogue-intelligence/\
> │ │ │ ├── scene-dna/\
> │ │ │ ├── storyboard-shots/\
> │ │ │ ├── visual-generation/\
> │ │ │ ├── audio-studio/\
> │ │ │ ├── editorial-timeline/\
> │ │ │ ├── export-deliver/\
> │ │ │ ├── project-settings/\
> │ │ │ ├── team-collaboration/\
> │ │ │ ├── assets-library/\
> │ │ │ └── help-support/\
> │ │ ├── shared/\
> │ │ └── shell/\
> │ └── api/src/\
> │ ├── modules/\
> │ │ ├── projects/\
> │ │ ├── screenplay/\
> │ │ ├── characters/\
> │ │ ├── dialogue/\
> │ │ ├── scene-dna/\
> │ │ ├── shots/\
> │ │ ├── generation/\
> │ │ ├── audio/\
> │ │ ├── editorial/\
> │ │ ├── rendering/\
> │ │ ├── assets/\
> │ │ └── collaboration/\
> │ ├── orchestration/\
> │ ├── providers/\
> │ └── infrastructure/\
> ├── engines/\
> │ ├── story/\
> │ ├── character/\
> │ ├── dialogue/\
> │ ├── world/\
> │ ├── scene-dna/\
> │ ├── cinematography/\
> │ ├── generation/\
> │ ├── audio/\
> │ ├── editorial/\
> │ ├── rendering/\
> │ ├── assets/\
> │ └── orchestration/\
> ├── packages/\
> │ ├── contracts/\
> │ ├── database/\
> │ ├── production-graph/\
> │ ├── engine-sdk/\
> │ ├── permissions/\
> │ ├── media-core/\
> │ └── observability/\
> ├── workers/\
> │ ├── ai-worker/\
> │ ├── image-worker/\
> │ ├── video-worker/\
> │ ├── audio-worker/\
> │ ├── render-worker/\
> │ ├── qc-worker/\
> │ └── indexing-worker/\
> └── tests/\
> ├── contracts/\
> ├── integration/\
> ├── e2e/\
> └── production-flows/

# 3. Frontend Module Standard

A page is only an orchestration/composition surface. It must not contain
provider SDK calls, SQL/database code, complex AI prompts or unrelated
domain logic.

> apps/web/src/modules/scene-dna/\
> ├── page.tsx\
> ├── components/\
> │ ├── SceneOverview.tsx\
> │ ├── LocationEnvironment.tsx\
> │ ├── CharacterDialogue.tsx\
> │ ├── PropsWardrobe.tsx\
> │ ├── CinematicStyle.tsx\
> │ ├── PerformanceBlocking.tsx\
> │ ├── LightingPanel.tsx\
> │ ├── SoundIntent.tsx\
> │ ├── TechnicalDetails.tsx\
> │ └── ContinuityPanel.tsx\
> ├── hooks/\
> ├── api/\
> ├── state/\
> ├── schemas/\
> ├── types/\
> ├── tests/\
> └── README.md

If the Scene DNA Lighting UI is defective, the engineer should normally
begin in components/LightingPanel.tsx. If the lighting recommendation
itself is wrong, inspect the lighting engine instead of rewriting the
UI.

# 4. Backend Domain Standard

> apps/api/src/modules/scene-dna/\
> ├── sceneDNA.controller.ts\
> ├── sceneDNA.service.ts\
> ├── sceneDNA.repository.ts\
> ├── sceneDNA.validator.ts\
> ├── sceneDNA.mapper.ts\
> ├── sceneDNA.events.ts\
> ├── sceneDNA.permissions.ts\
> ├── commands/\
> │ ├── GenerateSceneDNA.ts\
> │ ├── UpdateSceneDNA.ts\
> │ ├── ApproveSceneDNA.ts\
> │ └── UnlockSceneDNA.ts\
> ├── queries/\
> │ ├── GetSceneDNA.ts\
> │ ├── GetSceneReadiness.ts\
> │ └── GetSceneImpact.ts\
> └── tests/

  -----------------------------------------------------------------------
  **Layer**                           **Responsibility**
  ----------------------------------- -----------------------------------
  Controller                          HTTP/API transport only;
                                      validation/auth context; no
                                      business logic.

  Service                             Domain workflow and transaction
                                      boundaries.

  Repository                          Canonical persistence access for
                                      this domain.

  Validator                           Business invariants/readiness
                                      validation.

  Commands                            State-changing operations.

  Queries                             Read-only retrieval/composition.

  Events                              Typed events emitted after
                                      committed changes.

  Permissions                         Domain-specific authorization
                                      checks.
  -----------------------------------------------------------------------

# 5. Engine Folder Standard

The SRS defines logical engines. They are independently testable
modules, NOT 255 separate deployed services.

> engines/scene-dna/sceneBlockingEngine/\
> ├── index.ts\
> ├── engine.ts\
> ├── input.schema.ts\
> ├── output.schema.ts\
> ├── rules.ts\
> ├── prompt.ts \# only if this engine uses an LLM\
> ├── validator.ts\
> ├── version.ts\
> └── tests/

Every engine must declare engine_id, semantic version, typed input
schema, typed output schema, deterministic/AI classification, trigger,
required permissions, idempotency behavior, dependency versions,
telemetry fields and tests.

# 6. Domain-to-Folder Map

  ----------------------------------------------------------------------------------------------------------------
  **AuraStage    **Frontend**                    **Backend            **Engine domain**        **Canonical
  workspace**                                    authority**                                   object**
  -------------- ------------------------------- -------------------- ------------------------ -------------------
  Scriptwriter   modules/scriptwriter            modules/screenplay   engines/story            Script / Scene

  Casting &      modules/casting-characters      modules/characters   engines/character        Character /
  Characters                                                                                   CharacterState

  Dialogue       modules/dialogue-intelligence   modules/dialogue     engines/dialogue         DialogueLine
  Intelligence                                                                                 

  Scene DNA      modules/scene-dna               modules/scene-dna    engines/scene-dna        SceneDNA

  Storyboard &   modules/storyboard-shots        modules/shots        engines/cinematography   Shot
  Shots                                                                                        

  Visual         modules/visual-generation       modules/generation   engines/generation       GenerationPackage /
  Generation                                                                                   Take

  Audio Studio   modules/audio-studio            modules/audio        engines/audio            AudioSession / Mix

  Editorial &    modules/editorial-timeline      modules/editorial    engines/editorial        AssemblyTimeline /
  Timeline                                                                                     PictureLock

  Export &       modules/export-deliver          modules/rendering    engines/rendering        RenderManifest /
  Deliver                                                                                      Deliverable

  Assets Library modules/assets-library          modules/assets       engines/assets           Asset /
                                                                                               AssetVersion
  ----------------------------------------------------------------------------------------------------------------

# 7. Shared Contracts --- Mandatory

Frontend, backend, engines and workers must not independently redefine
production objects. Shared schemas live in packages/contracts and are
versioned.

> packages/contracts/src/\
> ├── project/\
> ├── screenplay/\
> ├── character/\
> ├── dialogue/\
> ├── scene-dna/\
> ├── shot/\
> ├── generation/\
> ├── asset/\
> ├── audio/\
> ├── editorial/\
> ├── rendering/\
> └── collaboration/

-   Use runtime validation at trust boundaries, not TypeScript types
    alone.

-   Cross-domain references use canonical IDs + version IDs.

-   No module writes directly to another domain\'s tables.

-   Changes to a shared contract require tests and impact review.

# 8. Production Graph and Synchronization

packages/production-graph is responsible for typed dependencies and
downstream impact. It must be possible to trace Script version →
Character/Dialogue versions → Scene DNA → Shot DNA → Generation Package
→ Take → Timeline → Render Manifest.

An upstream approved change never silently rewrites downstream objects.
MOS traverses dependency edges and marks affected descendants
REVIEW_REQUIRED or STALE. Destructive deletion is prohibited where
approved downstream usage exists.

# 9. Provider Gateway

> apps/api/src/providers/\
> ├── reasoning/\
> │ ├── openai/\
> │ ├── anthropic/\
> │ └── gemini/\
> ├── image/\
> ├── video/\
> │ ├── runway/\
> │ ├── kling/\
> │ ├── luma/\
> │ └── other-adapters/\
> ├── voice/\
> ├── speech-to-text/\
> ├── lipsync/\
> ├── music/\
> └── repair-upscale/

Pages and domain services must never import vendor SDKs directly. They
call a provider-neutral interface. Example video contract:
getCapabilities(), estimateCost(), generate(), getStatus(), cancel(). If
one provider changes its API, the fix remains inside that adapter.

# 10. Worker Separation

Expensive/long-running work must not run in normal HTTP request
handlers.

  -----------------------------------------------------------------------
  **Worker**                          **Examples**
  ----------------------------------- -----------------------------------
  AI worker                           Long reasoning, extraction, Scene
                                      DNA/shot planning jobs.

  Image worker                        Image/storyboard/reference
                                      generation and repair.

  Video worker                        Video generation polling/webhooks
                                      and post-processing.

  Audio worker                        STT/TTS, alignment, restoration,
                                      waveform/audio analysis.

  Render worker                       Timeline render, encode, packaging.

  QC worker                           Visual/audio/subtitle/delivery QC.

  Indexing worker                     Embeddings, search indexing and
                                      asset metadata enrichment.
  -----------------------------------------------------------------------

# 11. CLAUDE.md --- Root Engineering Rules

Create CLAUDE.md at repository root. Claude must read it before
modifying the application.

> THE AURASTAGE ENGINEERING RULES\
> \
> 1. Identify the canonical domain authority before editing.\
> 2. Modify the smallest responsible module.\
> 3. Never create duplicate canonical entities or stores.\
> 4. Never write directly to another domain\'s tables.\
> 5. Use packages/contracts for shared data structures.\
> 6. Cross-domain synchronization uses domain events and canonical IDs.\
> 7. Provider calls go through Provider Gateway only.\
> 8. Expensive work goes through MOS/jobs/workers.\
> 9. Every engine has typed input/output and a version.\
> 10. Every production-changing operation is version-aware.\
> 11. Never silently overwrite approved downstream work.\
> 12. Never fabricate readiness, progress, health or provider status.\
> 13. Never replace working implementations with placeholders/stubs.\
> 14. Preserve tests; add regression tests for every bug fix.\
> 15. Before editing multiple domains, produce an impact explanation.\
> 16. After work, list every file changed and why.\
> 17. Run relevant unit, contract, integration and/or E2E tests.\
> 18. Do not refactor unrelated code while fixing a localized defect.\
> 19. Respect project/module/object permissions in API and AI tools.\
> 20. Keep the SRS and MODULE_REGISTRY synchronized with architectural
> changes.

# 12. Module README Requirement

Every frontend and backend module must contain README.md with: purpose;
canonical owner; inputs/reads; outputs/writes; upstream dependencies;
downstream consumers; relevant engines; API endpoints; database objects;
events emitted/consumed; permissions; tests; known operational error
codes.

# 13. Error and Traceability Convention

  -----------------------------------------------------------------------
  **Prefix**                          **Subsystem**
  ----------------------------------- -----------------------------------
  AURA-SCR                            Scriptwriter

  AURA-CHR                            Characters

  AURA-DLG                            Dialogue

  AURA-SDNA                           Scene DNA

  AURA-SHOT                           Storyboard/Shots

  AURA-GEN                            Generation

  AURA-AUD                            Audio

  AURA-EDT                            Editorial

  AURA-EXP                            Export

  AURA-AST                            Assets

  AURA-MOS                            Orchestration
  -----------------------------------------------------------------------

Every operational error should carry trace_id, project_id, relevant
object ID, engine_id/version when applicable, job_id,
provider_request_id when applicable and timestamp. User-facing messages
must be safe; diagnostic detail belongs in authorized logs.

# 14. GitHub Issue and Change Discipline

-   Label issues by domain, engine, type and severity.

-   Bug fixes should include a regression test reproducing the defect.

-   Pull requests state affected canonical objects, events and
    downstream modules.

-   Claude must not broaden a localized bug into a platform-wide rewrite
    without explicit approval.

-   Architecture changes require an ADR in docs/ADR/.

-   Database migrations are additive/reversible where practical and
    reviewed separately.

Example: \'Scene 27 contains Amara but Scene DNA reports zero
characters.\' Trace path: scene-dna UI → scene-dna API → participant
resolver → character extraction/entity resolution → canonical
Scene/Character relationships → Scene DNA engine. Inspect the first
failing boundary; do not rewrite all layers.

# 15. Build Order

  -----------------------------------------------------------------------
  **Order**                           **Implementation**
  ----------------------------------- -----------------------------------
  0                                   Repository skeleton, CLAUDE.md,
                                      contracts, database, auth,
                                      observability, CI/CD.

  1                                   Project + Assets + permissions +
                                      audit + MOS foundation.

  2                                   Scriptwriter.

  3                                   Casting & Characters.

  4                                   Dialogue Intelligence.

  5                                   Scene DNA + production
                                      graph/invalidation.

  6                                   Storyboard & Shots.

  7                                   Provider Gateway + Visual
                                      Generation.

  8                                   Audio Studio.

  9                                   Editorial & Timeline.

  10                                  Export & Deliver.

  11                                  Collaboration/Help hardening,
                                      scale, security and studio
                                      integrations.
  -----------------------------------------------------------------------

# 16. Definition of Done for Claude

-   Feature is in the correct domain folder.

-   No unrelated files were modified.

-   Canonical authority remains intact.

-   Shared contract changes are explicit and tested.

-   All writes are permission-checked and version-aware.

-   Async work is idempotent and observable.

-   Errors have subsystem codes and trace IDs.

-   Tests pass and a regression test exists for bugs.

-   Module README is updated if behavior/contracts changed.

-   Claude returns a concise changed-file manifest and explains
    downstream impact.

This repository hierarchy is mandatory for The AuraStage. The SRS
describes the whole production system; this document tells Claude how to
physically organize and maintain the code so humans and AI can trace
defects directly to the responsible page, domain, engine, worker or
provider adapter.
