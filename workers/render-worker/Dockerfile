# workers/render-worker/Dockerfile — the render worker (Railway service "render-worker").
# Built from the repo root so the workspace (contracts, engines, api storage) resolves.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@aurastage/render-worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@aurastage/render-worker", "start"]
