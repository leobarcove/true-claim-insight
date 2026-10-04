#!/usr/bin/env bash
# Decide which staging images this commit needs built.
#
# Per image, not per push: each published `:main` image carries the commit it
# was built from (the org.opencontainers.image.revision label), and an image
# is rebuilt when the paths that feed it changed between THAT commit and this
# one. Diffing against the previous push instead would be wrong after a failed
# run — the image would be stale while its source looked unchanged.
#
# Writes to $GITHUB_OUTPUT:
#   base      true|false   rebuild the Node base image first
#   node      "svc svc"    workspace images to build (Node services, migrate, edge)
#   analyzer  true|false   rebuild the Python risk-analyzer
#   reuse     "svc svc"    images unchanged here — retagged, not rebuilt
#
# Env: REGISTRY (e.g. ghcr.io/leobarcove), HEAD_SHA, FORCE_ALL (true|false).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
export REPO_ROOT
# shellcheck source=../lib/changed-services.sh
source "$REPO_ROOT/deploy/staging/lib/changed-services.sh"

WORKSPACE=(migrate api-gateway case-service video-service risk-engine edge)
NODE_SERVICES=(migrate api-gateway case-service video-service risk-engine)

# The commit an image at :main was built from, or empty when there is none
# (first run, or a registry error — both mean "build it").
built_from() {
  skopeo inspect --no-tags "docker://${REGISTRY}/tci-staging-$1:main" 2>/dev/null \
    | jq -r '.Labels["org.opencontainers.image.revision"] // empty' || true
}

# True when <svc> must be rebuilt for HEAD, given the commit it was built from.
needs_build() {
  local svc="$1" from="$2" list
  [[ "${FORCE_ALL:-false}" == "true" || -z "$from" ]] && return 0
  git cat-file -e "${from}^{commit}" 2>/dev/null || return 0   # history rewritten
  if ! list="$(changed_build_services "$from" "$HEAD_SHA")"; then
    return 0                                                     # cannot tell
  fi
  grep -qx "$svc" <<< "$list"
}

declare -A build=()

base_from="$(skopeo inspect --no-tags "docker://${REGISTRY}/tci-staging-node-base:main" 2>/dev/null \
  | jq -r '.Labels["org.opencontainers.image.revision"] // empty' || true)"
base=false
if [[ "${FORCE_ALL:-false}" == "true" || -z "$base_from" ]] \
  || ! git cat-file -e "${base_from}^{commit}" 2>/dev/null \
  || [[ -n "$(git diff --name-only "$base_from" "$HEAD_SHA" -- deploy/staging/node-base.Dockerfile)" ]]; then
  base=true
  # Every Node service sits on the base; a new base means new images.
  for svc in "${NODE_SERVICES[@]}"; do build[$svc]=1; done
fi

for svc in "${WORKSPACE[@]}" risk-analyzer; do
  [[ -n "${build[$svc]:-}" ]] && continue
  from="$(built_from "$svc")"
  if needs_build "$svc" "$from"; then build[$svc]=1; fi
  printf '  %-14s built from %s\n' "$svc" "${from:-<none>}"
done

node=() reuse=()
for svc in "${WORKSPACE[@]}"; do
  if [[ -n "${build[$svc]:-}" ]]; then node+=("$svc"); else reuse+=("$svc"); fi
done
analyzer=false
if [[ -n "${build[risk-analyzer]:-}" ]]; then analyzer=true; else reuse+=(risk-analyzer); fi

echo "base=${base}  node=[${node[*]:-}]  analyzer=${analyzer}  reuse=[${reuse[*]:-}]"
{
  echo "base=${base}"
  echo "node=${node[*]:-}"
  echo "analyzer=${analyzer}"
  echo "reuse=${reuse[*]:-}"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
