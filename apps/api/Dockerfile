# apps/api/Dockerfile
# Built with the full monorepo as build context (Railway: dockerfilePath =
# apps/api/Dockerfile, context = repo root) so pnpm workspace resolution and
# turbo's dependency-aware build (packages/contracts, packages/database ->
# apps/api) work exactly as they do in local dev. See CLAUDE.md rule 7/8:
# this is the only place apps/api's runtime image is defined.

FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# espeak-ng: the robotic fallback voice (providers/audio/voice). curl: downloads the neural voice below.
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng curl ca-certificates && rm -rf /var/lib/apt/lists/*
# The neural voice (Piper + VCTK / LibriTTS-R voices, measured) — before the source copy so it stays cached between deploys.
COPY apps/api/scripts/piper-install.sh apps/api/scripts/piper-measure.mjs /tmp/
RUN sh /tmp/piper-install.sh

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@aurastage/api

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "--filter", "@aurastage/api", "start"]
