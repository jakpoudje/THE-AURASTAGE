# Live signed-in smoke test

Claude Code cloud sessions can't reach `*.railway.app` or `*.supabase.co` directly,
so the live check runs **inside Railway** as the Function service `live-smoke`
(project `aurastage`, service id `440e0caf-864a-402f-9ce8-1730d2a637a8`, restart policy NEVER).
`smoke.ts` here is the source of truth; keep the Railway function's code identical.

## Run it
1. Create the throwaway account (Supabase SQL, see CLAUDE.md Working agreement):
   insert into `auth.users` + `auth.identities` with email `live-smoke@aurastage.invalid`
   and a fresh random password (bcrypt via `extensions.crypt`).
2. Set the function's variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_URL`,
   `WEB_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD` (setting them redeploys = runs the test).
   To re-run without changes, redeploy the service.
3. Read the deploy logs: one JSON line per check, then `SUMMARY n/m passed`.
4. Clean up: delete the account's organization(s) (cascades projects, scripts,
   characters, audit rows), then the `auth.users` row; rotate `SMOKE_PASSWORD`.

It covers: API health, web pages, sign-in, studio bootstrap, project create
(incl. long synopsis regression), story setup edit, runtime plan, script
save/409/approve -> scenes, casting sync/confirm/edit/approve/rename clash,
persistence re-read, and cross-project 403.
