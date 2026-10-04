# syntax=docker/dockerfile:1.7
# True Claim Insight — Node service images, packaged from what CI assembled.
#
# CI compiles the workspace once, then `pnpm deploy --prod` gives each service
# a self-contained folder: its dist/ plus PRODUCTION dependencies only (about
# 300-700 MB, against the 1.5 GB workspace node_modules every image used to
# carry). ci/assemble.sh lays it out as deps/node_modules and app/.
#
# Two images per service, so that a code change never re-packages dependencies:
#
#   target deps     base + node_modules. Tagged deps-<content hash>; CI builds
#                   it only when no image with that hash exists yet.
#   target service  that deps image + app/. The only layer a code change makes.
#   target migrate  the same, with the migration command.
#
# Built in CI only — see .github/workflows/staging-images.yml. The old
# whole-workspace Dockerfile remains for `deploy.sh --build-local`.
ARG BASE_IMAGE
ARG DEPS_IMAGE

FROM ${BASE_IMAGE} AS deps
# The path each service used under the old layout. The compose volumes mount
# storage/ and uploads/ beneath it, and the services resolve those from
# process.cwd(), so it must not move.
ARG APP_DIR
WORKDIR ${APP_DIR}
COPY deps/node_modules ./node_modules

FROM ${DEPS_IMAGE} AS app
# --link: the layer is built without the image beneath it, so the builder
# never downloads the 300-700 MB of dependencies just to add a few MB of code.
COPY --link app/ ./

FROM app AS service
CMD ["node", "dist/main.js"]

# Applies committed migrations, then exits. Called by path rather than through
# pnpm: the image has no pnpm, and corepack would fetch one at run time.
FROM app AS migrate
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
