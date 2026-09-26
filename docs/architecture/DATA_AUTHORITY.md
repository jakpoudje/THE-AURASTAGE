# Canonical Data Authority

One field -> one canonical authority -> many consumers. No competing copies of story,
character, scene, shot or technical truth.

| Entity | Canonical owner | Purpose |
|---|---|---|
| Organization | Collaboration | Tenant/studio boundary |
| Project | Project Settings + Scriptwriter-owned story fields | Production root |
| Script / Act / Sequence / Scene | Scriptwriter | Versioned screenplay + narrative hierarchy |
| Character | Casting | Canonical identity |
| CharacterState | Casting + Scene DNA resolution | Story-time look/condition/knowledge/emotion |
| DialogueLine | Dialogue Intelligence | Approved spoken/written line + semantics |
| Location / Prop | Scene/Asset domain | Canonical place/set/prop |
| WardrobeLook | Casting | Named character look |
| SceneDNA | Scene DNA | Versioned scene production blueprint |
| Shot | Storyboard & Shots | Canonical Shot DNA |
| GenerationPackage / Take | Visual Generation | Provider-neutral spec + generated result |
| Asset / AssetVersion | Assets Library | Media/reference metadata, lineage, rights |
| AudioSession / Track / Clip / Bus / Automation | Audio Studio | DAW session + mix objects |
| AssemblyTimeline / PictureLock | Editorial | NLE timeline authority + approved lock |
| RenderManifest / Deliverable | Export | Immutable render spec + master/package output |
| Task / Comment / Review / Approval | Collaboration | Human workflow |
| Job / EngineRun | MOS | Execution state and telemetry |
| AuditEvent | Platform | Immutable actor/action/version history |

### Single-authority examples

- Target runtime, genre, setting, period and narrative structure are edited in
  Scriptwriter. Project Settings displays them as inherited and links back.
- Master frame rate, aspect ratio, color pipeline, sample rate and provider policy are
  edited in Project Settings and inherited by production pages.
- Character identity is edited in Casting. Scene DNA selects the correct CharacterState
  for a story moment; it does not redefine the character.
- Approved dialogue text is owned by Dialogue Intelligence. Audio Studio realizes it
  sonically but does not silently rewrite it.
- Media bytes are stored once as Assets/AssetVersions; Scene DNA, Shot DNA, Audio and
  Editorial reference Asset IDs only.
