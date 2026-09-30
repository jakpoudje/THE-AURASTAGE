
## What's next bar (owner request 2026-09-30)
`components/NextStepBar.tsx`, shown under the header of every production stage: the current stage's next step and
progress from `GET /api/projects/:id/overview` (productionOverviewEngine — the same evidence the Dashboard uses). It
re-reads after any save (`apiClient` announces `aura:saved` after every successful write) or AI apply, and offers
"Continue to …" when the stage is complete ("Skip ahead to …" before that).
