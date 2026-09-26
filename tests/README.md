# Cross-module tests

- **contracts/** — packages/contracts schema compatibility tests.
- **integration/** — multi-layer tests within one domain (controller -> service -> repository).
- **e2e/** — full user-facing flows through the web app.
- **production-flows/** — the SRS §23 worked end-to-end scene example, encoded as a
  regression suite: Script -> Character/Dialogue -> Scene DNA -> Shot -> Generation ->
  Audio -> Editorial -> Picture Lock -> Render Manifest -> Deliverable, asserting
  version/provenance is preserved at every step and upstream changes correctly mark
  descendants STALE/REVIEW_REQUIRED instead of silently mutating them.
