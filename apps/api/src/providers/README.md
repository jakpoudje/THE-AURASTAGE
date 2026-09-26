# Provider Gateway

Pages and domain services must NEVER import a vendor SDK directly. They call a
provider-neutral interface; adapters below implement it per vendor.

Example video contract: `getCapabilities()`, `estimateCost()`, `generate()`,
`getStatus()`, `cancel()`. If a provider changes its API, the fix stays inside that
one adapter — the rest of the platform is unaffected.

## Governance (SRS §17.2)

- Never call third-party providers directly from the browser with secret credentials.
- Store provider credentials in a secrets manager; workers receive short-lived/scoped access.
- Persist provider model/version/request ID and capability snapshot with every Take.
- Webhook endpoints verify signatures and are idempotent.
- A provider outage must not corrupt canonical production state.
- Terms/licensing/voice/likeness rights must be reviewed before enabling a provider in production.

## Capability -> adapters

- **reasoning**: openai, anthropic, gemini
- **image**: (adapter TBD — implement first provider here)
- **video**: runway, kling, luma, other-adapters
- **voice**: (adapter TBD — implement first provider here)
- **speech-to-text**: (adapter TBD — implement first provider here)
- **lipsync**: (adapter TBD — implement first provider here)
- **music**: (adapter TBD — implement first provider here)
- **repair-upscale**: (adapter TBD — implement first provider here)

Build discipline (SRS §22.1): implement the gateway interface + 1-2 providers per
critical capability first, then expand. Do not onboard every provider at once.
