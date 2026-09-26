# Scriptwriter browser test (offline)

Drives the real web app in Chromium against `mock-api.cjs`, a local stand-in
for the API that uses the real story engines. Covers: dashboard -> Scriptwriter,
project setup + runtime plan, honest AI-step notice, write/save/approve,
preview, Final Draft import -> re-approve (changed scene = Review required,
removed scene = Omitted), character extraction, PDF rejection message, and the
concurrent-edit (409) message.

It does not replace the live signed-in check (CLAUDE.md Working agreement);
it catches screen crashes and broken flows before deploying.

```bash
pnpm build                                   # engines/dist must exist
node tests/e2e/scriptwriter/mock-api.cjs &   # port 3911
cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=test pnpm build && PORT=3902 pnpm start &
# needs the `playwright` package; in Claude Code cloud sessions set
# CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
node tests/e2e/scriptwriter/run.cjs          # every line should read PASS
```

The same stand-in API also serves the Casting endpoints; see `tests/e2e/casting/run.cjs`
(start a fresh `mock-api.cjs` for each run — it keeps state in memory).
