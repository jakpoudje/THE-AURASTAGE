# Provider Gateway

Pages and domain services must NEVER import a vendor SDK directly. They call the
provider-neutral interface in `types.ts` (`generate()`, capabilities, models,
`isConfigured()`); adapters below implement it per vendor. If a provider changes
its API, the fix stays inside that one adapter.

## Adapters (Phase 7)

| id | capability | file | credentials |
|---|---|---|---|
| `aurastage-sketch` | image | `sketch/sketchAdapter.ts` | none — built-in deterministic storyboard sketch, **not AI**, labelled as such |
| `runway` | image (`gen4_image`), video (`gen4_turbo`, from an approved frame) | `video/runway/runwayAdapter.ts` | `RUNWAY_API_KEY` on the worker service |
| `openai` | image (`gpt-image-1`) | `image/openai/openaiImageAdapter.ts` | `OPENAI_API_KEY` on the worker service |

Status shown to people is evidence only (CLAUDE.md rule 12): `configured` means the
key exists on the server; the last real take result (succeeded/failed + time) is
shown next to it. Nothing claims a provider "works" before a real take succeeds.

## Where calls happen

Generation is long-running, so adapters are called only from the generation
worker (`workers/image-worker`, rule 8) — never inside an HTTP request. The API
only reads the registry for statuses and models.

## Governance (SRS §17.2)

- Never call third-party providers directly from the browser with secret credentials.
- Credentials live only in Railway service variables (worker); never in code or the database.
- Every Take stores provider, model, parameters, seed, request id and cost (when reported).
- A provider failure marks that Take failed with the reason; canonical production state is untouched.
- Terms/licensing/voice/likeness rights must be reviewed before enabling a provider in production.

## Not built yet

reasoning (LLM suggestions), voice, speech-to-text, lip-sync, music, repair/upscale
adapters — added with their phases (Audio Studio etc.).

## Reasoning and sound (Phase 13)
- `reasoning/` — Claude (`ANTHROPIC_API_KEY`, model `claude-opus-5-5`) and the labelled test planner. Structured-output
  schemas are sent with supported keywords only; limits go into descriptions and answers are validated with zod.
- `audio/` — `AudioAdapter` contract (ambience, fx, foley, score, voice). `aurastage-synth` is native (free, always
  configured) and never makes voices. `audioBackendsFor(kind, env)` only returns backends that can make that kind AND
  are configured. Paid sound/voice providers will be added here.
