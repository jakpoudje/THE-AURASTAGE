# The AuraStage

Advanced AI film production operating system — web + desktop. Full pipeline from
idea to deliverable: Scriptwriter -> Casting & Characters -> Dialogue Intelligence ->
Scene DNA -> Storyboard & Shots -> Visual Generation -> Audio Studio ->
Editorial & Timeline -> Export & Deliver, with Project Settings, Team & Collaboration,
Assets Library and Help & Support operating horizontally across all of it.

This repository is a **modular monolith**, not one giant app and not hundreds of
microservices. Read `CLAUDE.md` before making any change.

## Layout

- `apps/web` — Next.js-class frontend. One module per workspace under `src/modules/**`.
- `apps/api` — backend API. One module per production domain under `src/modules/**`,
  plus `orchestration/` (MOS), `providers/` (Provider Gateway) and `infrastructure/`.
- `engines/` — typed deterministic/AI engines, grouped by domain. Independently testable
  logical modules, not separately deployed services.
- `packages/` — shared contracts, database access, the production graph, engine SDK,
  permissions, media-core helpers and observability, versioned and shared by every app/engine/worker.
- `workers/` — long-running/async job runners (AI, image, video, audio, render, QC, indexing).
- `docs/` — the SRS, architecture registry (module map, production graph, data authority),
  and Architecture Decision Records.
- `tests/` — contract, integration, E2E and full production-flow tests spanning modules.

## Getting started

```bash
pnpm install
pnpm dev        # runs apps/web + apps/api together via turbo
pnpm test       # runs all workspace test suites
```

Environment variables: copy `.env.example` to `.env` and fill in Supabase/Railway/provider
credentials. Never commit `.env`.

## Status

Phase 0 — repository skeleton. See `docs/architecture/MODULE_REGISTRY.md` for build order
and current phase.
