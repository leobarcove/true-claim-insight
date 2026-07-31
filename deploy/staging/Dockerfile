# syntax=docker/dockerfile:1.7
# ============================================================================
# True Claim Insight — staging images.
#
# One shared build stage compiles the whole pnpm/turbo workspace; each runtime
# target copies the identical built tree, so Docker stores that layer once and
# the four Node images differ only in WORKDIR and CMD. WORKDIR is set to the
# service's own package directory because the services resolve their local
# storage roots from process.cwd() (storage/, uploads/) — exactly as in dev.
#
# Build from the REPO ROOT:
#   docker build -f deploy/staging/Dockerfile --target api-gateway .
# ============================================================================

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Build stage: install workspace, generate Prisma client, turbo build.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build

# openssl for Prisma engine detection; ca-certificates for postinstall
# downloads (ffmpeg-static, Prisma engines, bcrypt prebuilds).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The repo pins pnpm via the packageManager field; corepack honours it.
RUN corepack enable

WORKDIR /app

# Manifests first so dependency layers cache across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api-gateway/package.json apps/api-gateway/
COPY apps/case-service/package.json apps/case-service/
COPY apps/video-service/package.json apps/video-service/
COPY apps/risk-engine/package.json apps/risk-engine/
COPY apps/risk-analyzer/package.json apps/risk-analyzer/
COPY apps/adjuster-portal/package.json apps/adjuster-portal/
COPY apps/claimant-web/package.json apps/claimant-web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/ui-components/package.json packages/ui-components/
COPY packages/prisma-client/package.json packages/prisma-client/
COPY packages/crypto/package.json packages/crypto/

# HUSKY=0: the prepare hook must not run against a context with no .git.
ENV HUSKY=0
RUN pnpm install --frozen-lockfile

COPY . .

# Frontends are built for same-origin API access behind the Caddy edge; both
# api clients already default to /api/v1, this pins the one localhost fallback.
ENV VITE_API_URL=/api/v1

RUN pnpm prisma:generate && pnpm build

# ---------------------------------------------------------------------------
# Shared Node runtime base — the built workspace, verbatim.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS node-runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
ENV NODE_ENV=production
COPY --from=build /app /app

FROM node-runtime AS api-gateway
WORKDIR /app/apps/api-gateway
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node-runtime AS case-service
WORKDIR /app/apps/case-service
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM node-runtime AS video-service
WORKDIR /app/apps/video-service
EXPOSE 3002
CMD ["node", "dist/main.js"]

FROM node-runtime AS risk-engine
WORKDIR /app/apps/risk-engine
EXPOSE 3004
CMD ["node", "dist/main.js"]

# One-shot migration/seed runner (compose overrides the command for seeding).
FROM node-runtime AS migrate
WORKDIR /app/packages/prisma-client
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Edge: Caddy serving both frontends + reverse proxy to the gateway.
# ---------------------------------------------------------------------------
FROM caddy:2-alpine AS edge
COPY --from=build /app/apps/adjuster-portal/dist /srv/adjuster
COPY --from=build /app/apps/claimant-web/dist /srv/claimant
COPY deploy/staging/Caddyfile /etc/caddy/Caddyfile
