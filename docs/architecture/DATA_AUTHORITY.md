# Canonical Data Authority

One field -> one canonical authority -> many consumers. No competing copies of story,
character, scene, shot or technical truth.

| Entity | Canonical owner | Purpose |
|---|---|---|
| Organization | Collaboration | Tenant/studio boundary |
| OrgMember / ProjectMember / ProjectRole / Invite | Collaboration | Who may do what (migration 0019); enforced by `gate_write` and project-scoped RLS |
| Project | Project Settings + Scriptwriter-owned story fields | Production root |
| ProjectSettings / ProjectSettingsVersion | Project Settings | Versioned production-wide choices (loudness standard, frame shape, look, providers, paid-take cap, required deliverables, credits); migration 0023 |
| Script / Act / Sequence / Scene | Scriptwriter | Versioned screenplay + narrative hierarchy |
| Character | Casting | Canonical identity |
| CharacterState | Casting + Scene DNA resolution | Story-time look/condition/knowledge/emotion |
| DialogueLine | Dialogue Intelligence | Approved spoken/written line + semantics |
| Location / Prop | Scene/Asset domain | Canonical place/set/prop |
| WardrobeLook | Casting | Named character look |
| SceneDNA | Scene DNA | Versioned scene production blueprint |
| Shot | Storyboard & Shots | Canonical Shot DNA |
| GenerationPackage / Take | Visual Generation | Provider-neutral spec + generated result |
| Asset / AssetVersion / AssetLink | Assets Library | Media/reference metadata, versions (a new file never overwrites an old one), usage links to scenes/characters; migration 0024 |
| AudioSession / Track / Clip / Bus / Automation | Audio Studio | DAW session + mix objects |
| AssemblyTimeline / PictureLock | Editorial | NLE timeline authority + approved lock |
| RenderManifest / Deliverable | Export | Immutable render spec + master/package output |
| Task / Comment / Review / Approval | Collaboration | Human workflow |
| Job / EngineRun | MOS | Execution state and telemetry |
| AuditEvent | Platform | Immutable actor/action/version history |

### Single-authority examples

- Target runtime, genre, setting, period and narrative structure are edited in
  Scriptwriter. Project Settings displays them as inherited and links back.
- Aspect ratio for new prompts, loudness standard, look, default providers, paid-take cap,
  required deliverables and credits are edited in Project Settings and inherited by production
  pages. Frame rate (24 fps), colour pipeline (Rec.709), master resolution (1080p) and sample
  rate (48 kHz) are fixed by the pipeline today; Project Settings shows them with the reason.
- Character identity is edited in Casting. Scene DNA selects the correct CharacterState
  for a story moment; it does not redefine the character.
- Approved dialogue text is owned by Dialogue Intelligence. Audio Studio realizes it
  sonically but does not silently rewrite it.
- Media bytes are stored once as Assets/AssetVersions; Scene DNA, Shot DNA, Audio and
  Editorial reference Asset IDs only.
