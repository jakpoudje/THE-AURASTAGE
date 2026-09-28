# image-worker (generation worker)

Consumes generation Takes from the MOS queue (migration 0013) — the only place
provider adapters are called (CLAUDE.md rules 7–8).

Loop: `worker_claim_take` → Provider Gateway `generate()` (apps/api/src/providers)
→ store bytes in the private media bucket (apps/api/src/storage/media.ts) →
`worker_complete_take`, or `worker_fail_take` with the provider's reason and
request id. Idle polling every 3 s. Idempotent: completing twice is a no-op; a
crashed claim is re-queued by the database after 15 minutes (max 3 attempts).

Runs as the Railway service `generation-worker`
(`RAILWAY_DOCKERFILE_PATH=workers/image-worker/Dockerfile`, restart ALWAYS).

## Env
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WORKER_TOKEN` (its SHA-256 is in
`worker_credentials`), `MEDIA_BUCKET`, `MEDIA_ENDPOINT`, `MEDIA_REGION`,
`MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, optional `RUNWAY_API_KEY`,
`OPENAI_API_KEY`.

## Tests
`src/worker.test.ts` (claim → generate → store → complete; failure path).
