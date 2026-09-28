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
| Assets Library | apps/web/src/modules/assets-library | apps/api/src/modules/assets | engines/assets | Asset / AssetVersion |
| Team & Collaboration | apps/web/src/modules/team-collaboration | apps/api/src/modules/collaboration | engines/collaboration | Organization / OrgMember / ProjectMember / Invite / Comment / Task / Notification |

Horizontal frontend-only workspaces (no single owned backend domain — they compose across domains):
- apps/web/src/modules/home
- apps/web/src/modules/dashboard
- apps/web/src/modules/project-settings
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
- [ ] Phase 11 — Collaboration/Help hardening, scale, security, studio integrations
  - [x] 11a Team & permissions (studio roles; the SRS film roles per project with module × action permissions and extra grants; invite links (hashed, single-use, email-bound, 14 days); every user-callable write goes through `gate_write` in the database and every read is project-scoped; plain-language refusals; audit events carry their project. Deferred with reason: object-level scope (one scene/shot) needs per-object ACLs in every domain; SSO/MFA need an identity provider plan)
  - [x] 11b Comments (version-aware, Editorial timecode anchors, mentions, replies, resolve), notifications (bell), tasks and review requests, activity feed from the audit trail (activityFeedEngine). Deferred with reason: email/push delivery of notifications needs an email provider; comments on individual objects inside workspaces (a line, a shot) beyond Editorial's timecode need per-module anchors
  - [ ] 11c Help & Support (real system/provider status, guides, permission-bound assistant, tickets) and account security

**Permission rule (since 11a):** every new user-callable write function must start with
`perform public.gate_write(<project>, '<module>', '<action>')`. `tests/integration/team_db.sql` lists any that don't.

Update this checklist whenever a phase completes.
