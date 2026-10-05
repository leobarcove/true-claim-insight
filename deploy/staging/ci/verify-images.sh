#!/usr/bin/env bash
# Boot every Node service image this run built, against a throwaway Postgres
# and Redis, and fail unless each one reaches "successfully started".
#
#   ci/verify-images.sh <svc> [<svc> ...]     (migrate and edge are skipped)
#
# Why it exists: on 5 Oct 2026 the first slim images shipped api-gateway and
# video-service without @fastify/static — never declared, only ever found in
# the old shared workspace node_modules — and both crash-looped on staging.
# An import check cannot see that (Nest loads the package lazily, for
# Swagger); starting the application can.
#
# Env: REGISTRY, HEAD_SHA.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
ENV_FILE="$ROOT/deploy/staging/ci/smoke.env"
NET=tci-smoke
BOOT_TIMEOUT=90

image() { echo "${REGISTRY}/tci-staging-$1:sha-${HEAD_SHA}"; }

# Fetch the images while Postgres starts: the pulls are most of this step.
migrate="$(image migrate)"
docker manifest inspect "$migrate" >/dev/null 2>&1 || migrate="${REGISTRY}/tci-staging-migrate:main"
for svc in "$@"; do
  case "$svc" in migrate|edge) ;; *) docker pull -q "$(image "$svc")" >/dev/null & ;; esac
done
docker pull -q "$migrate" >/dev/null &

docker network create "$NET" >/dev/null
docker run -d --name smoke-pg --network "$NET" \
  -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=tci postgres:16.6-alpine >/dev/null
docker run -d --name smoke-redis --network "$NET" redis:7.4-alpine >/dev/null
until docker exec smoke-pg pg_isready -U postgres -q; do sleep 1; done

wait   # the pulls started above
# The migrations this commit ships, run by the migrate image this commit ships
# (or the current one, when migrate did not change).
docker run --rm --network "$NET" --env-file "$ENV_FILE" "$migrate"

services=()
for svc in "$@"; do
  case "$svc" in migrate|edge) ;; *) services+=("$svc") ;; esac
done
[[ ${#services[@]} -gt 0 ]] || { echo "no service images to boot"; exit 0; }

for svc in "${services[@]}"; do
  docker run -d --name "boot-$svc" --network "$NET" --env-file "$ENV_FILE" "$(image "$svc")" >/dev/null
done

failed=0
for svc in "${services[@]}"; do
  start=$SECONDS result=""
  while (( SECONDS - start < BOOT_TIMEOUT )); do
    if docker logs "boot-$svc" 2>&1 | grep -q "successfully started"; then result=ok; break; fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "boot-$svc")" != "true" ]]; then result=exited; break; fi
    sleep 1
  done
  if [[ "$result" == "ok" ]]; then
    printf '  booted %-14s in %2ss\n' "$svc" "$((SECONDS - start))"
  else
    echo "::error::${svc} did not start (${result:-timed out after ${BOOT_TIMEOUT}s})"
    docker logs --tail 40 "boot-$svc" 2>&1 | sed 's/\x1b\[[0-9;]*m//g'
    failed=1
  fi
done
exit "$failed"
