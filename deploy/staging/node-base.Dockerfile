# True Claim Insight — the base under every Node service image.
#
# Its own image, rebuilt only when this file changes, so the layers beneath
# each service's node_modules are byte-identical from one build to the next.
# Docker reuses a layer it already holds only when everything under it is
# the same; an apt-get run inside every service build would produce a new
# layer each time and make the server download each service's dependencies
# again on every deploy.
#
# openssl: the Prisma query engine links libssl. curl: compose health checks.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
