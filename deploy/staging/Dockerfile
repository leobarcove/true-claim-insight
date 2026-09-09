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

# The pnpm store on a BuildKit cache mount, so a rebuild re-uses packages it has
# already downloaded instead of fetching the whole workspace again. The store
# lives OUTSIDE /app deliberately: `COPY . .` below would otherwise bury it.
#
# pnpm normally hardlinks from the store into node_modules; across a mount
# boundary it cannot, and copies instead. That is still far cheaper than
# downloading, and it is why the store is not simply left in its default place.
RUN --mount=type=cache,id=tci-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY . .

# Frontends are built for same-origin API access behind the Caddy edge; both
# api clients already default to /api/v1, this pins the one localhost fallback.
ENV VITE_API_URL=/api/v1

# Which hostname serves the agent-assisted surface, decided at build time
# because the bundle must not be able to change its mind at runtime — see
# apps/claimant-web/src/lib/surface.ts.
#
# Empty is the normal case: the app then falls back to the `agent.` prefix
# convention. Set it only when DNS names the host some other way, e.g.
# --build-arg VITE_AGENT_HOSTS=tci-agent.example.com
ARG VITE_AGENT_HOSTS=
ENV VITE_AGENT_HOSTS=${VITE_AGENT_HOSTS}

# Ceilings for the build itself — the highest-memory phase of a deploy by a wide
# margin, and the one no container mem_limit covers, because it happens before
# any container exists.
#
# turbo's default concurrency is 10: on a small host that means four nest builds
# and two Vite builds compiling at once, each an unbounded Node heap. On a host
# with no swap the kernel resolves that by killing whatever is largest, which on
# a shared box is somebody else's database, not this build.
#
# Both are overridable per environment, so a large dedicated builder can raise
# them: --build-arg TURBO_CONCURRENCY=10 --build-arg NODE_BUILD_HEAP_MB=4096
ARG TURBO_CONCURRENCY=3
ARG NODE_BUILD_HEAP_MB=2048
ENV TURBO_CONCURRENCY=${TURBO_CONCURRENCY}
ENV NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_HEAP_MB}

# turbo's cache, kept across builds on a mount of its own.
#
# `COPY . .` above invalidates this layer on any source change, so Docker always
# re-runs the command below — but turbo then compares its own input hashes per
# package and restores the untouched ones instead of compiling them. Change one
# service and only that service builds.
#
# Correctness depends on turbo.json listing VITE_* in the build task's env: Vite
# inlines those values, so they change the output without changing a single
# input file. A cache that does not know that returns the previous bundle and
# reports a hit.
# Pass the cache directory directly to Turbo, so task artefacts are retained
# in the persistent BuildKit cache mount between deployments.
ENV TURBO_CACHE_DIR=/turbo-cache
RUN --mount=type=cache,id=tci-turbo,target=/turbo-cache,sharing=locked \
  pnpm prisma:generate && pnpm exec turbo run build --cache-dir=/turbo-cache

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
