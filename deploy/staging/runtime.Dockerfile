# syntax=docker/dockerfile:1.7
# True Claim Insight — a Node service image, packaged from what CI assembled.
#
# CI compiles the workspace once, then `pnpm deploy --prod` gives each service
# a self-contained folder: its dist/ plus PRODUCTION dependencies only (about
# 300-700 MB, against the 1.5 GB workspace node_modules every image used to
# carry). The build context is that folder, laid out by ci/assemble.sh:
#
#   deps/node_modules   - one layer; identical bytes while dependencies are
#   app/                  unchanged, so the server already has it
#
# Built in CI only — see .github/workflows/staging-images.yml. The old
# whole-workspace Dockerfile remains for `deploy.sh --build-local`.
ARG BASE_IMAGE
FROM ${BASE_IMAGE} AS base
# The path each service used under the old layout. The compose volumes mount
# storage/ and uploads/ beneath it, and the services resolve those from
# process.cwd(), so it must not move.
ARG APP_DIR
WORKDIR ${APP_DIR}
COPY deps/node_modules ./node_modules
COPY app/ ./

FROM base AS service
CMD ["node", "dist/main.js"]

# Applies committed migrations, then exits. Called by path rather than through
# pnpm: the image has no pnpm, and corepack would fetch one at run time.
FROM base AS migrate
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
