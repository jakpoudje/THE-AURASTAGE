# workers/image-worker/Dockerfile — the generation worker (Railway service "generation-worker").
# Built from the repo root so the workspace (contracts, engines, api gateway) resolves.
FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# espeak-ng: the built-in voice (AuraStage built-in voice adapter, providers/audio/voice).
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@aurastage/image-worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@aurastage/image-worker", "start"]
