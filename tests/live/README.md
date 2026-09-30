# Live signed-in smoke test

Claude Code cloud sessions can't reach `*.railway.app` or `*.supabase.co` directly,
so the live check runs **inside Railway** as the Function service `live-smoke`
(project `aurastage`, service id `440e0caf-864a-402f-9ce8-1730d2a637a8`, restart policy NEVER).
`smoke.ts` here is the source of truth. The Railway function is a small loader that downloads
`tests/live/smoke.ts` from the public repository at `SMOKE_REF` (default `main`) and runs it, so push first.

## Run it
1. Create the throwaway account (Supabase SQL, see CLAUDE.md Working agreement):
   insert into `auth.users` + `auth.identities` with email `live-smoke@aurastage.invalid`
   and a fresh random password (bcrypt via `extensions.crypt`).
2. Set the function's variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_URL`,
   `WEB_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, and a second throwaway account `SMOKE2_EMAIL`, `SMOKE2_PASSWORD`
   (used for the Team, permission, comment and task checks). Setting them redeploys = runs the test.
   To re-run without changes, redeploy the service.
3. Read the deploy logs: one JSON line per check, then `SUMMARY n/m passed`.
4. Clean up: delete the account's organization(s) (cascades projects, scripts,
   characters, audit rows), then the `auth.users` row; rotate `SMOKE_PASSWORD`.

It covers: API health, web pages, sign-in, studio bootstrap, project create
(incl. long synopsis regression), story setup edit, runtime plan, script
save/409/approve -> scenes, casting sync/confirm/edit/approve/rename clash,
manual characters, relationships, wardrobe looks, dialogue sync/annotate/approve,
Scene DNA assemble/save/412 not-ready/lock/upstream-change review/re-lock,
Storyboard plan/409/edit/approve/propagation, Visual Generation compile/worker take/signed media/approve/
unconnected-provider 412/propagation,
persistence re-read, Project Settings (impact preview, versioned save, 409, look → prompt review, defaults/budget,
required deliverables, credits in the render manifest), Assets Library (usage evidence, Replace keeps version 1's exact
bytes, a replaced recording flags the approved mix until re-measured, image upload/details/links/search/archive),
Ask AuraStage (capabilities, ask → worker plan → preview with permission and staleness → apply → undo, discard,
a Writer can ask but not apply a Casting change), and cross-project 403.

## Real-browser check (`live-browser`)

`tests/live/browser/run.mjs` signs in through the real web form with the same
throwaway account, creates a project, then uses Scriptwriter, Casting, Dialogue
and Scene DNA like a person would — and **reloads every page** to prove the
work was saved. It runs as the Railway service `live-browser` (Playwright image,
`RAILWAY_DOCKERFILE_PATH=tests/live/browser/Dockerfile`, restart policy NEVER,
watch pattern `tests/live/browser/**`). Env: `WEB_URL`, `SMOKE_EMAIL`,
`SMOKE_PASSWORD`. Run it (redeploy) after `live-smoke`, while the account still
exists; read `SUMMARY n/m passed` in its deploy logs; then clean up as above.
Never run it at the same time as `live-smoke`: the smoke's "sign out other devices" check ends the browser's session
(seen 2026-09-30: every check after it failed with "Invalid or expired session"). Start it after the smoke's `SUMMARY`.

## Generation worker (`generation-worker`)

`workers/image-worker` runs as the Railway service `generation-worker`
(`RAILWAY_DOCKERFILE_PATH=workers/image-worker/Dockerfile`, restart ALWAYS). The live
checks above need it running: a queued sketch take must finish within ~60 s.

## Provider key check (`keycheck.ts`)

Checks, without printing any key, whether the Claude, OpenAI and Kling keys on the API server and the generation
worker are accepted and can actually generate (one tiny request each). Run it through `live-smoke`: set
`SMOKE_FILE=keycheck.ts` and the reference variables `API_ANTHROPIC_API_KEY=${{THE-AURASTAGE.ANTHROPIC_API_KEY}}`,
`WORKER_ANTHROPIC_API_KEY=${{generation-worker.ANTHROPIC_API_KEY}}` (likewise `*_OPENAI_API_KEY`,
`*_KLING_ACCESS_KEY`, `*_KLING_SECRET_KEY`), read `KEYCHECK DONE` in the logs, then set `SMOKE_FILE=smoke.ts` again.
