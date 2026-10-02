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
| `google` | image (Imagen 4, Gemini image with up to 3 references), video (Veo 3, text or the approved frame) | `google/googleAdapter.ts` | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) |
| `stability` | image (Stable Image Ultra/Core, SD 3.5) | `image/stability/stabilityAdapter.ts` | `STABILITY_API_KEY` |
| `bfl` | image (FLUX 1.1 pro / Ultra, Kontext with one reference) | `image/bfl/bflAdapter.ts` | `BFL_API_KEY` |
| `luma` | image (Photon, references by signed link), video (Ray 2, text or the approved frame) | `video/luma/lumaAdapter.ts` | `LUMA_API_KEY` |
| `kling` | video (text or the approved frame; JWT-signed) | `video/kling/klingAdapter.ts` | `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (`KLING_API_BASE` optional) |
| `minimax` | video (Hailuo 02 text or frame, I2V-01 Live) | `video/minimax/minimaxAdapter.ts` | `MINIMAX_API_KEY` (`MINIMAX_API_BASE` optional) |

Only Runway needs an approved frame to make video (`videoNeedsFrame`); the others can also work from the prompt alone.
Shared polling/download/error helpers are in `http.ts` (they know no endpoints). Migration 0036 extends
`takes_provider_check` with these ids.

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
- `reasoning/` — Claude (`ANTHROPIC_API_KEY`, model `claude-opus-5-5`), OpenAI (`OPENAI_API_KEY`, `OPENAI_REASONING_MODEL`
  default `gpt-5`), Google Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL` default `gemini-2.5-pro`) and the labelled test planner.
  Structured-output schemas are sent with supported keywords only; limits go into descriptions and every answer is
  validated with zod (`structured.ts`). When several writers are connected they form a chain (`writerChain`): the next
  one answers only when an account has no credit or its key is refused, and the job records which one answered.
  `AURA_REASONING_PROVIDER` puts a preferred writer first.
- `audio/` — `AudioAdapter` contract (ambience, fx, foley, score, voice). `aurastage-synth` is native (free, always
  configured) and never makes voices. `aurastage-voice` is native and speaks dialogue with espeak-ng using the Voice DNA
  in `params.voice` (configured only where the espeak-ng program exists; arguments passed without a shell).
  `aurastage-kokoro-voice` (the default voice where installed, 2026-10-02) runs Kokoro-82M (Apache-2.0) via kokoro-js
  (Apache-2.0) in its own long-lived process (`apps/api/scripts/kokoro-say.mjs`, loaded once, stopped after 4 idle
  minutes); every English voice is measured at image build time (`kokoro-install.sh` → `/opt/kokoro/voices.json`) and
  cast by gender, age band, accent (American/British) and register (`audio/kokoro/cast.ts`). No child voices and no
  African/Caribbean/Asian accents in the free model — said in the reason, never pretended. If the install fails the
  build carries on without it and Piper is the default.
  `aurastage-neural-voice` (the next voice) runs Piper with multi-speaker VCTK and LibriTTS-R models; each speaker's
  register is measured at image build time (`apps/api/scripts/piper-install.sh`, `piper-measure.mjs`) and matched to the
  character's Voice DNA (`audio/neural/voices.ts`). `audioBackendsFor(kind, env)` only returns backends that can make
  that kind AND are configured. Paid sound/voice providers will be added here.

## Reference images (task 35, migration 0034)
Adapters declare `references` per capability (`max`, accepted media types, `max_bytes`); `references.ts`
`chooseReferences` decides what each provider receives and explains everything it leaves out; adapters name each
reference in the prompt (Runway `@char1` / `@place` / `@prop1` tags; OpenAI "reference image 1…"). Runway Gen-4 Image:
up to 3 (`referenceImages`); OpenAI Images: up to 6 via `/v1/images/edits`; sketch and Runway video: none.

## Third-party voice credits
- Kokoro-82M — © hexgrad, Apache-2.0 (https://huggingface.co/hexgrad/Kokoro-82M); ONNX export onnx-community/Kokoro-82M-v1.0-ONNX; kokoro-js © Xenova, Apache-2.0.
- Piper text-to-speech — © Michael Hansen, MIT licence (https://github.com/rhasspy/piper).
- en_GB-vctk-medium — trained on the CSTR VCTK Corpus (Yamagishi, Veaux, MacDonald; University of Edinburgh), CC BY 4.0.
- en_US-libritts_r-medium — trained on LibriTTS-R (Koizumi et al., Google), CC BY 4.0.

## AuraSketch 2 (built in, free, not AI)
`sketch/sketchAdapter.ts` draws with `engines/generation/auraSketchFigureEngine` (2.0.0): character sheets
(`renderCharacterSketch`) and storyboard frames (`renderSketch`) show each character as an illustrated figure built from
`characterAppearanceEngine` facts (profile, description, wardrobe look, age for the scene): proportions by life stage and
build, face, 12 hair styles, headwear, facial hair, glasses, scars, earrings and layered clothing in the described
colours, from four angles and framed per shot size. Skin tone comes only from the description's own words; anything not
described is drawn neutrally and listed (`sketch_reads.unspecified` in the Look panel).
