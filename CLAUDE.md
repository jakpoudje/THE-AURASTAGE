# THE AURASTAGE — ENGINEERING RULES

Read this file before modifying anything in this repository.

1. Identify the canonical domain authority before editing.
2. Modify the smallest responsible module.
3. Never create duplicate canonical entities or stores.
4. Never write directly to another domain's tables.
5. Use packages/contracts for shared data structures.
6. Cross-domain synchronization uses domain events and canonical IDs.
7. Provider calls go through the Provider Gateway only (apps/api/src/providers/**). Never import a vendor SDK from a page, domain service, or engine directly.
8. Expensive/long-running work goes through MOS/jobs/workers (workers/**), never inline in an HTTP request handler.
9. Every engine has typed input/output schemas and a semantic version (engines/**/*/version.ts).
10. Every production-changing operation is version-aware — write the exact source version IDs it was derived from.
11. Never silently overwrite approved downstream work. Upstream changes mark descendants REVIEW_REQUIRED or STALE via the production graph (packages/production-graph); they are never auto-deleted.
12. Never fabricate readiness, progress, health, or provider status. Readiness is a boolean predicate graph with evidence, not a decorative percentage.
13. Never replace a working implementation with a placeholder/stub without saying so explicitly and tracking it.
14. Preserve tests; add a regression test for every bug fix.
15. Before editing multiple domains, produce a short impact explanation first.
16. After work, list every file changed and why.
17. Run the relevant unit, contract, integration and/or E2E tests before considering work done.
18. Do not refactor unrelated code while fixing a localized defect.
19. Respect project/module/object permissions in both API endpoints and AI/assistant tools.
20. Keep docs/SRS, docs/architecture/MODULE_REGISTRY.md and this file synchronized with architectural changes.

## Repository map

See `docs/architecture/MODULE_REGISTRY.md` for the full domain-to-folder map and
`docs/SRS/` for the authoritative Software Requirements Specification this codebase implements.

## Traceability convention

Every operational error carries a subsystem prefix, e.g. `AURA-SDNA-014`. See
`docs/architecture/MODULE_REGISTRY.md` for the full prefix list. Example trace path for
"Scene 27 contains Amara but Scene DNA reports zero characters": scene-dna UI ->
scene-dna API -> participant resolver -> character extraction/entity resolution ->
canonical Scene/Character relationships -> Scene DNA engine. Inspect the first failing
boundary; do not rewrite all layers.

## Build order

Phase 0 (this scaffold) -> 1 Project+Assets+permissions+audit+MOS foundation -> 2 Scriptwriter ->
3 Casting & Characters -> 4 Dialogue Intelligence -> 5 Scene DNA + production graph/invalidation ->
6 Storyboard & Shots -> 7 Provider Gateway + Visual Generation -> 8 Audio Studio ->
9 Editorial & Timeline -> 10 Export & Deliver -> 11 Collaboration/Help hardening + scale/security.

## Definition of done

- Feature is in the correct domain folder.
- No unrelated files were modified.
- Canonical authority remains intact.
- Shared contract changes are explicit and tested.
- All writes are permission-checked and version-aware.
- Async work is idempotent and observable.
- Errors have subsystem codes and trace IDs.
- Tests pass and a regression test exists for bugs.
- Module README is updated if behavior/contracts changed.
- Every response ends with a concise changed-file manifest and downstream impact note.

## Working agreement

The owner (Julius) is not technical. Every session works fully autonomously under these rules:

1. Never ask the owner technical questions or for permission. Make the professional decision yourself, following this file, `docs/SRS/` and `docs/design/UI_REFERENCE.md`.
2. Only stop to ask for things only the owner can provide (a payment, an account login, an API key, or an environment/network setting). Say exactly where to find or change it.
3. Loop for every piece of work: build it -> run tests and the full `pnpm build` -> push to `main` -> watch the Railway deploys for both services (`THE-AURASTAGE` API and `web`) and fix any failure -> verify the live site yourself.
4. Live verification means: `GET https://the-aurastage-production.up.railway.app/health` returns ok, `https://web-production-be750e.up.railway.app` loads, and a real signed-in test of the new feature passes. Create a throwaway test account for it (e.g. `*@aurastage.invalid`) and delete it (and its org/projects) afterwards.
5. Never say something is done until it has been checked live. If a check could not be run, say so plainly and say why.
6. Build order: finish the current phase, then continue through the phases in "Build order" above. After each phase, give the owner a short plain-language update: what's new, the link to see it, and what to try.
7. Database migrations live in `packages/database/migrations/` and are applied to the live Supabase project (ref `wczporjnmgdqmxqxvbhm`) in the same piece of work; run the Supabase security advisor afterwards.
