# Production Graph

Canonical production backbone (SRS §1.1):

```
Project/Story -> Character DNA -> Dialogue Intelligence -> Scene DNA -> Shot DNA
  -> Generation Package -> Take -> Approved Take -> Audio/Editorial -> Picture Lock
  -> Render Manifest -> Deliverable
```

Project Settings, Assets Library, Team & Collaboration, MOS, Provider Gateway,
Audit/Event Log and Help/Diagnostics operate horizontally across the entire backbone.

## Invalidation rule

When an approved version U becomes U', `packages/production-graph` traverses the
dependency graph. Descendants are marked `REVIEW_REQUIRED` or `STALE` according to
dependency type. They are **never** automatically deleted. Impact priority:
`I = Σ(criticality × dependency_strength × recomputation_cost × approval_weight)`.

## Representative domain events (outbox, transactionally coupled with canonical writes)

ScriptApproved, CharacterDNAApproved, DialogueApproved, SceneDNAApproved, ShotApproved,
TakeApproved, MixApproved, PictureLocked, RenderRequested, DeliverableCompleted,
UpstreamVersionChanged.
