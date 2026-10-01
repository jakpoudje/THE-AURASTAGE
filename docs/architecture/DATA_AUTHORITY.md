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
| Character | Casting | Canonical identity, including how the name is said (`pronunciation`, migration 0046 — the voices read it) |
| CharacterState | Casting + Scene DNA resolution | Story-time look/condition/knowledge/emotion |
| DialogueLine | Dialogue Intelligence | Approved spoken/written line + semantics |
| Location / Prop | Locations & Props (`apps/api/src/modules/world`) | Canonical place/set/prop, found in the approved script (migration 0028) |
| WardrobeLook | Casting | Named character look |
| SceneDNA | Scene DNA | Versioned scene production blueprint, incl. the scene's on-screen text (migration 0040) |
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
- On-screen text for a scene is written only in Scene DNA; renders read it (never copy it into the timeline).
- Opening title, end credits, credit names and the theme switch are written only in Project Settings; the cast in the
  roll comes from Casting at render time.
- The assistant (Ask AuraStage) owns nothing: every change it makes goes through the owning stage's own save function
  (same permission gate, versions, audit and review flags as a manual edit), and it keeps only the proposal and the
  before/after needed for undo (`ai_proposals`).
- The Scriptwriter's "current story" is the only source of character names before Casting exists; after the script is
  approved, Casting's characters are the names every later stage uses.
- What is done and what is left is tracked in one place: `BUILD_PLAN.md` (section 8).

- Provider prices live in one place: `engines/generation/costEstimateEngine/prices.ts` (each with its published source and
  `PRICES_AS_OF`). Every "Estimated cost" on every page is computed from it by `costEstimateEngine`; a model without a
  confirmed price shows "price not confirmed" with the provider's price page, never a guessed number.
