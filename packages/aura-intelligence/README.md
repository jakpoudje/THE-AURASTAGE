# @aurastage/aura-intelligence

The provider-free Intelligence Core (docs/architecture/INTELLIGENCE_PLAN.md). It understands *what* a filmmaker is
asking for and *which* AuraStage tools can do it; it never calls a model or a database itself.

- `capabilities/` — the capability vocabulary every Model Gateway backend declares (TEXT_REASONING, IMAGE_GENERATION…).
- `contracts/` — AssistantRequest, Intent, ContextBundle, Plan, ToolCall, Proposal.
- `intent/` — deterministic pre-classifier: which workspaces and objects a request touches (narrows context and tools).
- `context/` — context budget rules: only relevant objects, each with canonical id + version.
- `planning/` — the planner instructions and the static plan schema a reasoning model must return.
- `tool-registry/` — tool definition types (module/action for the permission gate, typed input, declared impact, undo).
- `validation/` — plan validation: every call names a registered tool, its input validates, permission and impact known.

Model calls live in `apps/api/src/providers` (CLAUDE.md rule 7); tool implementations live in
`apps/api/src/modules/assistant/tools` and call the owning domain's services (rule 4).
