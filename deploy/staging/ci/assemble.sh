#!/usr/bin/env bash
# Lay out a Docker build context per image from an already-built workspace.
#
#   ci/assemble.sh <out-dir> <svc> [<svc> ...]
#
# Node services and migrate come from `pnpm deploy`, which copies the package
# and installs ITS dependencies only — production ones for a service, all of
# them for migrate (which needs the prisma CLI and tsx for seeding). Each lands
# as <out-dir>/<svc>/{deps/node_modules, app/} for runtime.Dockerfile.
#
# Run after `pnpm install` and the turbo build: pnpm deploy copies dist/ as it
# finds it. Paths must stay constant between runs — pnpm writes absolute paths
# into node_modules/.bin, and an unchanged dependency set should produce an
# unchanged layer.
set -euo pipefail

OUT="$1"; shift
ROOT="$(git rev-parse --show-toplevel)"
PRISMA="$ROOT/packages/prisma-client/node_modules/.bin/prisma"
SCHEMA="$ROOT/packages/prisma-client/prisma/schema.prisma"
STAGE="${RUNNER_TEMP:-/tmp}/tci-pnpm-deploy"

package_of() {
  case "$1" in
    migrate) echo "@tci/prisma-client" ;;
    *)       echo "@tci/$1" ;;
  esac
}

assemble_node() {
  local svc="$1" pkg tmp ctx
  pkg="$(package_of "$svc")"
  tmp="$STAGE/$svc"
  ctx="$OUT/$svc"
  rm -rf "$tmp" "$ctx"

  if [[ "$svc" == "migrate" ]]; then
    HUSKY=0 pnpm --filter "$pkg" deploy "$tmp" >/dev/null
  else
    HUSKY=0 pnpm --filter "$pkg" deploy --prod "$tmp" >/dev/null
  fi

  # pnpm deploy installs @prisma/client fresh, without the generated client —
  # the generator is a dev dependency of @tci/prisma-client. Generate it into
  # this folder with the workspace's own CLI; the schema's location is what
  # tells prisma which @prisma/client to write into.
  if [[ "$svc" == "migrate" ]]; then
    "$PRISMA" generate --schema "$tmp/prisma/schema.prisma" >/dev/null
  else
    mkdir -p "$tmp/.prisma-schema"
    cp "$SCHEMA" "$tmp/.prisma-schema/schema.prisma"
    "$PRISMA" generate --schema "$tmp/.prisma-schema/schema.prisma" >/dev/null
    rm -rf "$tmp/.prisma-schema"
  fi

  # pnpm's own bookkeeping, stamped with the install time; nothing reads it at
  # run time, and leaving it would make every build's dependency layer differ.
  rm -f "$tmp/node_modules/.modules.yaml"
  # Sources and tests are not run; storage/ and uploads/ are volume mounts.
  rm -rf "$tmp/src" "$tmp/test" "$tmp/storage" "$tmp/uploads"

  mkdir -p "$ctx/deps"
  mv "$tmp/node_modules" "$ctx/deps/node_modules"
  mv "$tmp" "$ctx/app"
}

assemble_edge() {
  local ctx="$OUT/edge"
  rm -rf "$ctx"
  mkdir -p "$ctx"
  cp -R "$ROOT/apps/adjuster-portal/dist" "$ctx/adjuster"
  cp -R "$ROOT/apps/claimant-web/dist" "$ctx/claimant"
  cp "$ROOT/deploy/staging/Caddyfile" "$ctx/Caddyfile"
}

for svc in "$@"; do
  start=$SECONDS
  case "$svc" in
    edge) assemble_edge ;;
    migrate|api-gateway|case-service|video-service|risk-engine) assemble_node "$svc" ;;
    *) echo "assemble: unknown image '$svc'" >&2; exit 1 ;;
  esac
  # One timestamp for every file, so the layer's bytes depend on content only.
  find "$OUT/$svc" -exec touch -h -d @0 {} +
  printf '  assembled %-14s in %3ss  (%s)\n' "$svc" "$((SECONDS - start))" "$(du -sh "$OUT/$svc" | cut -f1)"
done
