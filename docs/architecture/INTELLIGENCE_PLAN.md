# AuraStage Intelligence Layer — audit and implementation plan

Owner directive "Native AI + Creative Intelligence" (2026-09-28). This is the audit (steps 1–4) and plan (step 5).
It extends the existing architecture; nothing working is rebuilt.

## 1. What already exists and is reused

| Directive component | Already in the repo | Reuse |
|---|---|---|
| Model Gateway | `apps/api/src/providers` — typed `ProviderAdapter`, registry, `providerStatuses()` from evidence | Becomes the Model Gateway. CLAUDE.md rule 7 keeps every vendor call here. |
| AuraSketch | `providers/sketch` — built-in SVG storyboard frames from the compiled package (framing, subject, shot size) | Registered as the **AuraStage native** image backend; extended in Phase 3. |
| External providers | OpenAI Images, Runway (image + image-to-video) | Stay as external adapters, now with declared capabilities. |
| AuraVideo intelligence | `engines/generation/promptCompilerEngine` → `GenerationPackage` with provenance from approved shot plan, locked Scene DNA, Casting, Dialogue, project look | This is the provider-independent package the directive describes; extended in Phase 7. |
| Jobs / MOS | `jobs` table (engine id/version, idempotency, input snapshot, status, cost), worker claim/complete functions, `generation-worker`, `render-worker` | Assistant planning and generation run as jobs in workers (rule 8). |
| Permissions | `gate_write(project, module, action)` in every write function; RLS reads | Every tool executes through the existing domain write paths, so the gate applies unchanged. |
| Audit / activity | `audit_events` (+ project), `activityFeedEngine` | Tools and proposals write audit events. |
| Versioning | script, Scene DNA, shot plan, audio session, timeline, settings, asset versions | Tools create versions through the domain services. |
| Production graph | `packages/production-graph` + each domain's review refresh (`refreshShotPlanReview`, `refreshAudioReview`…) | Impact analysis reads it; nothing is auto-deleted (rule 11). |
| Readiness / overview | Domain readiness predicates, `productionOverviewEngine` | Context engine and planner read these. |
| Deterministic assistant | `engines/help/knowledgeRetrievalEngine` | Kept for Help; the new assistant is separate and production-aware. |

Canonical entities that exist (never duplicated): Project, Script/ScriptVersion, Scene, Character (+aliases,
relationships), WardrobeLook, DialogueLine, SceneDNA (+versions, includes wardrobe/lighting/sound intent),
ShotPlan/Shot, GenerationPackage/Take, Asset/AssetVersion/AssetLink, AudioSession/Track/Clip/Measurement/Version,
Timeline/Version/PictureLock, Render, ProjectSettings, Comment/Task/Notification, Job, AuditEvent.

## 2. What is missing

- **Intelligence Core** (provider-free): intent, context, planning, tool contracts, capability vocabulary, validation.
- **Tool Registry** mapping typed tools onto existing domain services, with declared module/action, impact and undo.
- **AI proposals** — a durable record of request → intent → context refs (ids + versions) → plan → approval →
  results (new version ids) → provenance.
- **Capability registry** on the gateway: text reasoning, image, image edit, storyboard, voice, music, SFX, video…
- **TestProvider** — deterministic, clearly labelled DEVELOPMENT / TEST OUTPUT, so the whole flow runs without paid APIs.
- **Reasoning providers** — Claude adapter (written, not yet wired); others later.
- **Ask AuraStage** UI in every workspace.
- Later phases: Performance DNA, Voice DNA, SoundEvent, MusicCue/plan, Location DNA — each gets one canonical owner
  (proposed: Performance DNA → Dialogue Intelligence; SoundEvent and MusicCue → Audio Studio; Location DNA → Scene DNA
  domain) before any table is created.

## 3. Placement (resolving the directive against CLAUDE.md)

- `packages/aura-intelligence/` — pure TypeScript, no vendor SDKs: `contracts/`, `intent/`, `context/`, `planning/`,
  `tool-registry/` (definitions only), `validation/`, `capabilities/`.
- Model Gateway stays in `apps/api/src/providers/` (rule 7): `providers/reasoning/` (Claude + TestProvider),
  capability declarations on every adapter, routing that never sends an operation to a backend without the capability.
- Tool implementations live in `apps/api/src/modules/assistant/tools/` and call the owning domain's service
  functions — never tables directly (rule 4).
- Model calls happen in `workers/image-worker` (the generation worker) through jobs (rule 8).

## 4. Phase 1 — build now

1. `packages/aura-intelligence`: Intent/Context/Plan/ToolCall/Proposal contracts; deterministic intent
   pre-classifier (module, target object, operation) used before and alongside the model; context builder contract
   (only the relevant objects, with canonical ids and versions); plan validator (every tool exists, inputs validate,
   permission known, impact declared).
2. Capability registry + TestProvider on the gateway; Claude adapter wired as an external reasoning provider.
   Routing: AuraStage native → Auto → External, never to a backend lacking the capability.
3. Migration 0025: `ai_proposals` (request, module, object ref, intent, context refs, plan, status
   queued/planning/proposed/applied/rejected/failed, provider, model, engine versions, `test_output`, results,
   error, created_by, applied_at) with RLS; gated `request_ai_proposal`, `reject_ai_proposal`; worker functions
   to claim/complete planning jobs; audit events.
4. Tool Registry, first tools (each through its existing domain service, so the gate, versions and review flags apply):
   `updateStory` (Project story fields), `updateCharacter`, `changeWardrobe`, `modifyDialogue`, `updateSceneDNA`,
   `modifyShot`. Apply = execute each tool call in order, record the new version ids, report downstream impact from
   the domains' own review states.
5. API `apps/api/src/modules/assistant`: POST ask, GET proposal, POST apply / reject; GET capabilities.
6. Ask AuraStage UI in AppShell (every workspace) with context of the current workspace/object: shows the plan as
   field-level before → after, labels TEST OUTPUT, Apply / Discard, then shows new versions and what was flagged.
7. Tests: package unit tests, tool contract tests, API route tests, `ai_db.sql`, offline e2e (TestProvider), live
   smoke/browser (TestProvider until a Claude key is added).

## 5. Later phases (directive order)

2 AuraScript (story development — `storyDevelopmentEngine` written — outline, scene generate/rewrite/expand/condense,
dialogue improvement, continuity), character/dialogue/Scene DNA assistance · 3 AuraSketch completion, AuraImage,
character/location reference sets and aging · 4 AuraVoice + Performance DNA · 5 AuraSFX/Foley/Ambience + SoundEvent ·
6 AuraMusic (music plan → generation, stems) · 7 AuraVideo (GenerationPackage 2.0, reference images) · 8 Editorial and
Export commands, cross-production automation, advanced QC.

## 6. Risks and how they are contained

- Silent overwrites → every change is a proposal applied through domain services that version and flag (rule 11).
- Permission bypass → tools run as the signed-in user through `gate_write`; the assistant never gets SQL.
- Fake output → TestProvider results are stored with `test_output = true` and labelled in the UI (rule 12).
- Cost/latency → context is built per request from the relevant objects only; model calls run in workers.
- Vendor lock-in → engines own prompts and schemas; adapters only execute.

## 7. Needs from the owner

`ANTHROPIC_API_KEY` for real reasoning (Claude). Image/video: `OPENAI_API_KEY` and/or `RUNWAY_API_KEY`. Voice/SFX:
`ELEVENLABS_API_KEY`. Suno has no official public API, so music will use a provider that has one (ElevenLabs music or
Stability Stable Audio). Until keys are added, everything runs end to end on the labelled TestProvider.
