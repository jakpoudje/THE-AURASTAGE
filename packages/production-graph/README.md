# @aurastage/production-graph

Typed dependency references, drift detection and impact priority (SRS §14.2,
docs/architecture/PRODUCTION_GRAPH.md).

An approved artefact (first: Scene DNA versions) freezes `DependencyRef`s — the
exact upstream objects and content fingerprints it was derived from. Later,
`computeDrift(frozen, current)` lists what changed:

| Upstream change | `hard` dependency | `soft` dependency |
|---|---|---|
| fingerprint changed | STALE | REVIEW_REQUIRED |
| upstream removed | STALE | REVIEW_REQUIRED |
| new upstream added | REVIEW_REQUIRED | REVIEW_REQUIRED |

`descendantState(drifts)` gives the worst state. Nothing is ever deleted — the
owning domain persists the state and shows the evidence (each drift's message).

`impactPriority` implements I = Σ(c × d × k × a) for ordering review work.

Tests: `pnpm --filter @aurastage/production-graph test`.
