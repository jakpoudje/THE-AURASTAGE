# Live browser check (CLAUDE.md Working agreement, rule 4): runs as the Railway
# service "live-browser" (restart policy NEVER). Built from the repo root with
# RAILWAY_DOCKERFILE_PATH=tests/live/browser/Dockerfile. Not part of the pnpm
# workspace on purpose — it only drives the deployed site in a real browser.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /check
COPY tests/live/browser/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY tests/live/browser/run.mjs ./
CMD ["node", "run.mjs"]
