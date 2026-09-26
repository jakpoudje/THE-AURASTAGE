# Engines

The SRS (§15) defines a 255-engine registry. These are **independently testable typed
modules**, NOT 255 separately deployed services (SRS §22.1 build discipline). Co-locate
engines within their domain service until scale genuinely justifies separation.

Every engine must declare: `engine_id`, semantic version, typed input schema, typed
output schema, deterministic/AI classification, trigger, required permissions,
idempotency behavior, dependency versions, telemetry fields and tests.

See `_template/` in each domain for the required engine folder shape, and
`docs/SRS/` (section 15) for the full per-engine input/output/trigger specification.
