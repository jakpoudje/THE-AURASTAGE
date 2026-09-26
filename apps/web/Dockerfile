# apps/web/Dockerfile
# Built with the full monorepo as build context (Railway: dockerfilePath =
# apps/web/Dockerfile, context = repo root). NEXT_PUBLIC_* vars are inlined
# into the client bundle at BUILD time by Next.js, so they must arrive as
# Docker build ARGs (Railway forwards configured service variables as build
# args automatically) -- setting them only at runtime would have no effect.

FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm turbo run build --filter=@aurastage/web

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "--filter", "@aurastage/web", "start"]
