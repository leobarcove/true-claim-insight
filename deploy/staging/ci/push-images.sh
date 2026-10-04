#!/usr/bin/env bash
# Package assembled contexts into images and push them, in parallel.
#
#   ci/push-images.sh <ctx-dir> <svc> [<svc> ...]
#
# Env: REGISTRY, HEAD_SHA, BASE_REF (the node base, pinned by digest),
#      PUBLISH_MAIN=true to also move :main (only for pushes to main).
#
# Every image is tagged sha-<commit>; that tag is what a deploy pulls, so a
# deploy names exactly the code it runs. :main marks the newest build and
# carries the commit it was built from, which ci/plan-images.sh reads.
set -euo pipefail

CTX="$1"; shift
ROOT="$(git rev-parse --show-toplevel)"
# Clamp every timestamp in the image to the epoch: with identical files, the
# layers then come out byte-identical and the registry and the server both
# recognise a dependency layer they already hold.
export SOURCE_DATE_EPOCH=0

app_dir() {
  case "$1" in
    migrate) echo "/app/packages/prisma-client" ;;
    *)       echo "/app/apps/$1" ;;
  esac
}

push_one() {
  local svc="$1" names file args=()
  names="${REGISTRY}/tci-staging-${svc}:sha-${HEAD_SHA}"
  [[ "${PUBLISH_MAIN:-false}" == "true" ]] && names+=",${REGISTRY}/tci-staging-${svc}:main"

  if [[ "$svc" == "edge" ]]; then
    file="$ROOT/deploy/staging/edge.Dockerfile"
  else
    file="$ROOT/deploy/staging/runtime.Dockerfile"
    args+=(--target "$([[ "$svc" == "migrate" ]] && echo migrate || echo service)"
           --build-arg "BASE_IMAGE=${BASE_REF}"
           --build-arg "APP_DIR=$(app_dir "$svc")")
  fi

  docker buildx build "$CTX/$svc" --file "$file" "${args[@]}" \
    --label "org.opencontainers.image.revision=${HEAD_SHA}" \
    --label "org.opencontainers.image.source=https://github.com/${GITHUB_REPOSITORY:-leobarcove/true-claim-insight}" \
    --provenance=false --sbom=false \
    --output "type=image,\"name=${names}\",push=true,rewrite-timestamp=true" \
    --progress=plain > "$CTX/$svc.build.log" 2>&1
}

pids=() names=()
for svc in "$@"; do
  ( start=$SECONDS; push_one "$svc"; printf '  pushed %-14s in %3ss\n' "$svc" "$((SECONDS - start))" ) &
  pids+=($!); names+=("$svc")
done

failed=0
for i in "${!pids[@]}"; do
  if ! wait "${pids[$i]}"; then
    echo "::error::image ${names[$i]} failed to build or push"
    tail -40 "$CTX/${names[$i]}.build.log"
    failed=1
  fi
done
exit "$failed"
