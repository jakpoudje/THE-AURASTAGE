# workers/image-worker/Dockerfile — the generation worker (Railway service "generation-worker").
# Built from the repo root so the workspace (contracts, engines, api gateway) resolves.
FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# espeak-ng: the robotic fallback voice (providers/audio/voice). curl: downloads the neural voice below.
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng curl ca-certificates && rm -rf /var/lib/apt/lists/*
# The neural voice (Piper + VCTK / LibriTTS-R voices, measured) — before the source copy so it stays cached between deploys.
COPY apps/api/scripts/piper-install.sh apps/api/scripts/piper-measure.mjs /tmp/
RUN sh /tmp/piper-install.sh
# The natural voice (Kokoro-82M, Apache-2.0; measured voices) — comes before Piper when installed; never fails the build.
COPY apps/api/scripts/kokoro-install.sh apps/api/scripts/kokoro-say.mjs /tmp/
RUN sh /tmp/kokoro-install.sh
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@aurastage/image-worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@aurastage/image-worker", "start"]
