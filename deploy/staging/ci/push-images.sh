#!/usr/bin/env bash
# Package assembled contexts into images and push them, in parallel.
#
#   ci/push-images.sh <ctx-dir> <svc> [<svc> ...]
#
# Env: REGISTRY, HEAD_SHA, BASE_REF (the node base, pinned by digest).
#
# Every image is tagged sha-<commit>; that tag is what a deploy pulls, so a
# deploy names exactly the code it runs. :main — the newest VERIFIED build,
# read by ci/plan-images.sh — is moved by the workflow after the boot test.
set -euo pipefail

CTX="$1"; shift
ROOT="$(git rev-parse --show-toplevel)"
# Clamp timestamps in the dependency layer to the epoch, so identical files
# give an identical layer. Not applied to the app layer: that changes with
# every code change anyway, and rewriting would make BuildKit fetch the
# dependency layers beneath it just to restamp them.
export SOURCE_DATE_EPOCH=0

app_dir() {
  case "$1" in
    migrate) echo "/app/packages/prisma-client" ;;
    *)       echo "/app/apps/$1" ;;
  esac
}

# The deps image for <svc>, by reference. Built and pushed only when no image
# with this exact content exists: the tag is a hash of the dependency tree plus
# the base it sits on, so "same tag" means "same bytes" and skipping is safe.
# Prints the reference; records "built" or "reused" in <ctx>/<svc>.deps.
deps_image() {
  local svc="$1" key ref log="$CTX/$1.build.log"
  key="$( { echo "$BASE_REF"; tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
            -cf - -C "$CTX/$svc/deps" node_modules; } | sha256sum | cut -c1-24)"
  ref="${REGISTRY}/tci-staging-${svc}:deps-${key}"
  if docker buildx imagetools inspect "$ref" >/dev/null 2>&1; then
    echo reused > "$CTX/$svc.deps"
  else
    docker buildx build "$CTX/$svc" --file "$ROOT/deploy/staging/runtime.Dockerfile" \
      --target deps \
      --build-arg "BASE_IMAGE=${BASE_REF}" --build-arg "DEPS_IMAGE=${BASE_REF}" \
      --build-arg "APP_DIR=$(app_dir "$svc")" \
      --provenance=false --sbom=false \
      --output "type=image,name=${ref},push=true,rewrite-timestamp=true" \
      --progress=plain >> "$log" 2>&1
    echo built > "$CTX/$svc.deps"
  fi
  echo "$ref"
}

push_one() {
  local svc="$1" names file args=() deps_ref
  # sha-<commit> only. :main moves after the boot test passes (the workflow's
  # "Promote" step), so a broken image is never what later runs reuse.
  names="${REGISTRY}/tci-staging-${svc}:sha-${HEAD_SHA}"

  if [[ "$svc" == "edge" ]]; then
    file="$ROOT/deploy/staging/edge.Dockerfile"
  else
    file="$ROOT/deploy/staging/runtime.Dockerfile"
    deps_ref="$(deps_image "$svc")"
    args+=(--target "$([[ "$svc" == "migrate" ]] && echo migrate || echo service)"
           --build-arg "BASE_IMAGE=${BASE_REF}"
           --build-arg "DEPS_IMAGE=${deps_ref}"
           --build-arg "APP_DIR=$(app_dir "$svc")")
  fi

  docker buildx build "$CTX/$svc" --file "$file" "${args[@]}" \
    --label "org.opencontainers.image.revision=${HEAD_SHA}" \
    --label "org.opencontainers.image.source=https://github.com/${GITHUB_REPOSITORY:-leobarcove/true-claim-insight}" \
    --provenance=false --sbom=false \
    --output "type=image,\"name=${names}\",push=true" \
    --progress=plain >> "$CTX/$svc.build.log" 2>&1
}

pids=() names=()
for svc in "$@"; do
  ( start=$SECONDS; push_one "$svc"
    note="$(cat "$CTX/$svc.deps" 2>/dev/null || true)"
    printf '  pushed %-14s in %3ss%s\n' "$svc" "$((SECONDS - start))" "${note:+  (dependencies ${note})}" ) &
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
