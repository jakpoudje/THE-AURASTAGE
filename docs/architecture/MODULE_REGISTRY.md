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

Every operational error carries: trace_id, project_id, relevant object ID, engine_id/version
(when applicable), job_id, provider_request_id (when applicable), timestamp. User-facing
messages must be safe; diagnostic detail belongs in authorized logs only.

## Build phase status

- [x] Phase 0 — repository skeleton, CLAUDE.md, contracts stubs, workspace tooling
- [x] Phase 1 — Project + Assets + permissions + audit + MOS foundation (org/project CRUD, RLS, audit trigger, jobs table skeleton; asset ingest still open)
- [x] Phase 2 — Scriptwriter (story setup, runtime plan, structured editor, Final Draft/Fountain import, immutable versions, approval → canonical scenes with review flags, character candidates. Deferred with reason: AI story development/script generation needs the Provider Gateway (Phase 7); PDF import needs a PDF text extractor, planned with Assets ingest)
- [ ] Phase 3 — Casting & Characters
- [ ] Phase 4 — Dialogue Intelligence
- [ ] Phase 5 — Scene DNA + production graph/invalidation
- [ ] Phase 6 — Storyboard & Shots
- [ ] Phase 7 — Provider Gateway + Visual Generation
- [ ] Phase 8 — Audio Studio
- [ ] Phase 9 — Editorial & Timeline
- [ ] Phase 10 — Export & Deliver
- [ ] Phase 11 — Collaboration/Help hardening, scale, security, studio integrations

Update this checklist whenever a phase completes.
