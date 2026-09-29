# Module Registry

The authoritative domain-to-folder map. Any defect must be traceable page -> component ->
API/domain service -> engine -> canonical data -> worker/provider using this table.

| Workspace | Frontend | Backend authority | Engine domain | Canonical object |
|---|---|---|---|---|
| Scriptwriter | apps/web/src/modules/scriptwriter | apps/api/src/modules/screenplay | engines/story | Script / Scene |
| Casting & Characters | apps/web/src/modules/casting-characters | apps/api/src/modules/characters | engines/character | Character / CharacterState |
| Dialogue Intelligence | apps/web/src/modules/dialogue-intelligence | apps/api/src/modules/dialogue | engines/dialogue | DialogueLine |
| Scene DNA | apps/web/src/modules/scene-dna | apps/api/src/modules/scene-dna | engines/scene-dna | SceneDNA |
| Storyboard & Shots | apps/web/src/modules/storyboard-shots | apps/api/src/modules/shots | engines/cinematography | Shot |
| Visual Generation | apps/web/src/modules/visual-generation | apps/api/src/modules/generation | engines/generation | GenerationPackage / Take |
| Audio Studio | apps/web/src/modules/audio-studio | apps/api/src/modules/audio | engines/audio | AudioSession / Mix |
| Editorial & Timeline | apps/web/src/modules/editorial-timeline | apps/api/src/modules/editorial | engines/editorial | AssemblyTimeline / PictureLock |
| Export & Deliver | apps/web/src/modules/export-deliver | apps/api/src/modules/rendering | engines/rendering | RenderManifest / Deliverable |
| Project Settings | apps/web/src/modules/project-settings | apps/api/src/modules/settings | — (settings feed engines as inputs) | ProjectSettings / ProjectSettingsVersion |
| Locations & Props | apps/web/src/modules/locations-props | apps/api/src/modules/world | engines/world | Location / Prop (+ WorldAppearance, WorldReferenceImage) |
| Assets Library | apps/web/src/modules/assets-library | apps/api/src/modules/assets | engines/assets | Asset / AssetVersion / AssetLink |
| Help & Support | apps/web/src/modules/help-support | apps/api/src/modules/help | engines/help | SupportTicket (+ system status from telemetry) |
| Ask AuraStage (Intelligence layer) | apps/web/src/modules/ask-aurastage (panel in AppShell) | apps/api/src/modules/assistant (+ packages/aura-intelligence, providers/reasoning) | planning prompts in packages/aura-intelligence | AIProposal (changes go through each domain's own service) |
| Team & Collaboration | apps/web/src/modules/team-collaboration | apps/api/src/modules/collaboration | engines/collaboration | Organization / OrgMember / ProjectMember / Invite / Comment / Task / Notification |

Horizontal frontend-only workspaces (no single owned backend domain — they compose across domains):
- apps/web/src/modules/home
- apps/web/src/modules/dashboard
- apps/web/src/modules/ai-generation (readiness from apps/api/src/modules/projects/projects.generation.ts)
- apps/web/src/modules/team-collaboration
- apps/web/src/modules/help-support

Horizontal backend-only domains:
- apps/api/src/modules/projects
- apps/api/src/modules/collaboration

## Error / traceability prefixes

| Prefix | Subsystem |
|---|---|
| AURA-SCR | Scriptwriter |
| AURA-CHR | Characters |
| AURA-DLG | Dialogue |
| AURA-SDNA | Scene DNA |
| AURA-SHOT | Storyboard/Shots |
| AURA-GEN | Generation |
| AURA-AUD | Audio |
| AURA-EDT | Editorial |
| AURA-EXP | Export |
| AURA-AST | Assets |
| AURA-MOS | Orchestration |
| AURA-COL | Team & Collaboration (permissions, invites) |
| AURA-HLP | Help & Support, account security |
| AURA-SET | Project Settings |
| AURA-AI | Ask AuraStage / Intelligence layer |
| AURA-WLD | Locations & Props |

Every operational error carries: trace_id, project_id, relevant object ID, engine_id/version
(when applicable), job_id, provider_request_id (when applicable), timestamp. User-facing
messages must be safe; diagnostic detail belongs in authorized logs only.

## Build phase status

- [x] Phase 0 — repository skeleton, CLAUDE.md, contracts stubs, workspace tooling
- [x] Phase 1 — Project + Assets + permissions + audit + MOS foundation (org/project CRUD, RLS, audit trigger, jobs table skeleton; asset ingest still open)
- [x] Phase 2 — Scriptwriter (story setup, runtime plan, structured editor, Final Draft/Fountain import, immutable versions, approval → canonical scenes with review flags, character candidates. Deferred with reason: AI story development/script generation needs the Provider Gateway (Phase 7); PDF import needs a PDF text extractor, planned with Assets ingest)
- [x] Phase 3 — Casting & Characters (extraction with evidence + confidence, confirmation queue, identity resolution/aliases, manual characters, profiles, relationships, wardrobe looks, merge/undo, consistency checks. Deferred with reason: visual/voice DNA and casting images need the Provider Gateway (Phase 7); CharacterState is resolved in Scene DNA (Phase 5))
- [x] Phase 4 — Dialogue Intelligence (lines from the approved script with speakers/listeners/timing, annotations, line and scene approval, change-safe re-sync with review flags, voiceprints, balance and quality checks. Deferred with reason: AI intent/subtext suggestions, exposition/knowledge guard and rewrite alternatives need the Provider Gateway (Phase 7))
- [x] Phase 5 — Scene DNA + production graph/invalidation (per-scene blueprint from approved script, Casting and Dialogue; detections with source lines; readiness predicates with evidence; lock as immutable versions with frozen dependency refs; upstream changes mark locked scenes review_required/stale with evidence, never deleted. Deferred with reason: AI generate/enhance needs the Provider Gateway (Phase 7); reference frames need Assets ingest; props need a Props authority)
- [x] Phase 6 — Storyboard & Shots (shot plans from locked Scene DNA versions with a rationale per shot; full Shot DNA editor; storyboard grid with framing guides, shot list, timeline; coverage maths over story time with dialogue lines as mandatory beats; approve as immutable versions; Scene DNA changes mark plans stale/review_required, never deleted. Deferred with reason: AI camera suggestions and storyboard images need the Provider Gateway (Phase 7); animatics and blocking diagrams later)
- [x] Phase 7 — Provider Gateway + Visual Generation (Provider Gateway with AuraStage Sketch (built-in, not AI), Runway image/video and OpenAI image adapters; prompt compiler from approved shot plan + locked Scene DNA + Casting + Dialogue with provenance and evidence checks; takes via MOS jobs and the generation worker; private media bucket with signed links; compare and explicit approval; plan changes mark packages stale. Waiting on the owner: RUNWAY_API_KEY / OPENAI_API_KEY to switch those providers on. Deferred: visual QC, repair, reference images)
- [x] Phase 8 — Audio Studio (sessions spotted from the approved shot plan + locked Scene DNA + Dialogue with evidence per cue; Assets Library audio upload to the private bucket; multitrack timeline with waveforms, clip editing, mixer with pan/gain/mute/solo and meters; ITU-R BS.1770-4 loudness of the actually rendered mix tied to the saved revision; readiness predicates; approve as immutable versions; WAV export of mix and DX/FX/BG/MX stems; plan changes mark sessions stale/review_required, recordings kept. Waiting on the owner: a voice/music/SFX provider key for AI generation. Deferred: ADR conform, stem separation)
- [x] Phase 9 — Editorial & Timeline (first assembly from approved takes over each scene's approved shot timing with the approved scene mix on A1; offline slugs for shots without a take; NLE edits — insert, overwrite, trim, ripple, roll, slip, slide, blade, lift, extract, move — with sync lock; per-clip grade preview; editorial QC with timecodes; named and automatic versions; Picture Lock as an immutable version, breaking it needs confirmation and records the impact; upstream changes flag the timeline and Conform swaps sources without changing the cut; CMX 3600 EDL export. Deferred: titles/subtitles, transitions, multi-cam, colour scopes, VFX conform, AI-assisted assembly)
- [x] Phase 10 — Export & Deliver (deliverables only from the current Picture Lock with an immutable, checksummed RenderManifest naming every source; versioned delivery profiles — Streaming Master (H.264 1080p24 + AAC + SRT), Review Copy (watermark, burned-in timecode), Mezzanine ProRes 422 HQ master, Audio Package (mix, DX/FX/BG/MX stems, M&E), Subtitles (SRT + WebVTT), EDL; renders run in the render worker (ffmpeg) through MOS jobs with progress and cancel; final QC per file (format, frame rate, exact duration, loudness via ffmpeg ebur128, SHA-256, subtitle read-back); signed downloads; deliverables from a broken lock are marked out of date, files kept. Not available (with reasons): DCP, 4K HDR, MXF broadcast, social vertical. Deferred: localisation, external delivery destinations, multipart uploads > 5 GB)
- [x] Phase 11 — Collaboration/Help hardening, scale, security, studio integrations
  - [x] 11a Team & permissions (studio roles; the SRS film roles per project with module × action permissions and extra grants; invite links (hashed, single-use, email-bound, 14 days); every user-callable write goes through `gate_write` in the database and every read is project-scoped; plain-language refusals; audit events carry their project. Deferred with reason: object-level scope (one scene/shot) needs per-object ACLs in every domain; SSO/MFA need an identity provider plan)
  - [x] 11b Comments (version-aware, Editorial timecode anchors, mentions, replies, resolve), notifications (bell), tasks and review requests, activity feed from the audit trail (activityFeedEngine). Deferred with reason: email/push delivery of notifications needs an email provider; comments on individual objects inside workspaces (a line, a shot) beyond Editorial's timecode need per-module anchors
  - [x] 11c Help & Support (system and provider status from worker heartbeats, database pings and job outcomes; written guides with search; the AuraStage Assistant answering from the guides and the project's permission-safe diagnostics; support tickets with consented diagnostics and a staff inbox) and account security (devices/sessions with sign-out, password change, per-person API rate limits, security headers on API and web)
  - Deferred with reason: an AI model for the assistant needs a reasoning-provider key (OPENAI/Anthropic) through the Provider Gateway; SSO/MFA need an identity-provider plan; GPU scheduling and multi-region disaster recovery need paid infrastructure beyond Railway's single region; email delivery of notifications and tickets needs an email provider; load testing at studio scale needs a staging environment

**Permission rule (since 11a):** every new user-callable write function must start with
`perform public.gate_write(<project>, '<module>', '<action>')`. `tests/integration/team_db.sql` lists any that don't.

Update this checklist whenever a phase completes.
- [ ] Completion pass — workspaces that still said "Soon"
  - [x] 12a Project Settings (versioned settings with save-conflict protection and an impact preview before saving; story fields inherited read-only from Scriptwriter; fixed pipeline facts shown with reasons (24 fps, Rec.709, 1080p, 48 kHz stereo). Settings drive: the loudness standard for Audio readiness and delivery QC (EBU R128 / ATSC A/85 / streaming −14), Visual Generation's default frame shape and providers, the project look in every compiled prompt (prompt compiler 1.1.0 "Style matched"; a look change marks compiled prompts for review), a monthly paid-take cap enforced in the database (AURA-GEN-402), required deliverables tracked in Export, and credits written into rendered file metadata (renderManifest 1.1.0). Changes apply to new work only; approved work is never rewritten)
  - [x] 12b Assets Library (library of every project file with the 12 SRS categories, search and filters via assetCatalogEngine 1.0.0, cards with type/version/specs/usage, detail panel with Overview/Usage/Metadata/Versions and asset comments; uploads checked by content (images, video, audio, PDF, text/CSV, .cube LUTs); Replace adds a version under a new storage key and never overwrites; usage from Audio Studio clips, render manifests and scene/character links; archive/restore; an approved mix whose recording is replaced is flagged and needs a fresh measurement before re-approval. Not built, with reason: thumbnails/proxies and vector/multimodal search need a media-processing worker; rights metadata needs a rights model)
  - [x] 12d Edit uploaded files in the browser (assetEditEngine 1.0.0): image crop/rotate/flip/colour/resize, audio trim/gain/fades/normalise with preview; saved as a new version with a note of the edit, originals kept
  - [x] 12c Dashboard overview from real evidence (nine stage cards from each domain's own read model via productionOverviewEngine 1.0.0: state, real counts, the checks behind them, needs-attention list, next step; project counts and recent activity. No estimated percentages)
- [ ] Phase 13 — Intelligence layer (owner directive 2026-09-28; audit + plan in docs/architecture/INTELLIGENCE_PLAN.md): Intelligence Core in packages/aura-intelligence, Model Gateway = apps/api/src/providers, real AI in every stage, consistency from the first frame to the last
  - [x] 13-1 Ask AuraStage foundation (Phase 1 of the plan): Intelligence Core (intent, context with canonical ids + versions, planner prompt, Tool Registry, plan validation), reasoning gateway with Claude and the labelled built-in test planner, ai_proposals (migration 0025) planned in the generation worker, six tools through the domain services (story setup, character profile, wardrobe look per scene, dialogue performance notes, Scene DNA, shot cinematography), a panel in every workspace with field-level before → after, permission and staleness checks, Apply, Undo (refused over newer edits), and the DEVELOPMENT / TEST OUTPUT label until a Claude key is added
  - [x] 13-4 AI & Generation readiness page (sidebar): every kind of generation (assistant, storyboard, character references, video, sound, music, voice, delivery) with its state from configured backends and what was actually made in this project (generationReadinessEngine 1.0.0: proven / ready / needs a key / not built) and the exact key for each paid option
  - [x] 13-3 Character look panel (Casting → Look & References): 16 reference views per character from one identity description (characterLookEngine 1.0.0: profile + wardrobe look + project look), made by AuraStage Sketch (built in) or a connected image provider in the generation worker (migration 0027), kept as Assets under Characters; a profile change marks views "Profile changed"; the front close-up becomes the character's portrait
  - [x] 13-7 Natural built-in voice: AuraStage neural voice (Piper, MIT) with VCTK (British Isles) and LibriTTS-R (American) multi-speaker voices (CC BY 4.0, credited in apps/api/src/providers/README.md); every speaker's register measured at image build time and matched to the character's base Voice DNA, so a character keeps one speaker; the line's emotion sets pace and energy; the espeak voice stays as the labelled robotic fallback
  - [x] 13-6 Locations & Props (migration 0028; SRS Location/Prop authority): worldExtractionEngine 1.0.0 finds one location per place (INT/EXT, times of day, sub-areas) and props/vehicles from action lines, each with the scene and line as evidence (character names are never props); the team names, describes, confirms, archives or adds by hand; re-sync never overwrites their work and flags (never deletes) what left the script; worldLookEngine 1.0.0 reference views (locations: establishing / wide / medium / detail per time of day; props: hero / ¾ / detail / overhead / in hand) made by AuraStage Sketch or a connected image provider in the generation worker, registered as Assets under Locations / Props / Vehicles and linked to the item; readiness shows them proven/ready from evidence
  - [x] 13-5 Built-in voice (Voice DNA): voiceCastingEngine 1.0.0 works out each character's voice (type, register, pace, accent) from the Casting profile, with the reasons, and adjusts delivery per line from its emotion; Casting → Voice DNA tab; Audio Studio "Generate voice" on a dialogue cue (and in "Generate all planned sounds") speaks the approved line with AuraStage's built-in voice (espeak-ng, robotic, free) in the generation worker, kept in the Assets Library; readiness shows voice proven/ready from evidence
  - [x] 13-2 Built-in sound (proceduralAudioEngine 1.0.0 via the audio side of the Provider Gateway): generate planned ambience / effects / Foley / score cues in the generation worker (migration 0026), real WAVs registered in the Assets Library with provenance, "Use this" on a cue
  - [x] 13-1b Real Claude planning live (ANTHROPIC_API_KEY on the API and generation worker)
  - [ ] 13a Reasoning gateway (Anthropic Claude primary; OpenAI/Gemini fallback) + an AI assistant in every stage: story understanding (story bible: premise, themes, arcs, timeline, time jumps, ages), Scriptwriter from a logline (synopsis, beat sheet, scenes), intelligent character names, auto-filling every workspace's fields as proposals the user accepts or edits
  - [ ] 13b Character bible (owner addition: a look panel per character — front / three-quarter / profile / back and CU/MCU/MS/full, from the script — used by storyboards, prompts and video as reference images; same for environments and props): character sheets filled from the storyline, relationships, the scenes each character appears in, story-driven aging (age per scene), wardrobe per scene, reference image sets per age/look state used by every shot
  - [ ] 13c Locations & environment bible with reference images and time-of-day variants
  - [ ] 13d Consistency-aware prompt compiler 2.0: character sheet + age + scene wardrobe + location + look, with reference images sent to providers that accept them; consistency checks with evidence
  - [ ] 13e Voice, sound effects and music generation (owner addition: sounds and background music detected from the script and suggested; voice types suggested from each character's profile) (ElevenLabs; a music provider with an official API) through worker jobs, placed into Audio Studio as proposals
  - [ ] 13f More video providers (Luma, Google Veo) and lip sync
