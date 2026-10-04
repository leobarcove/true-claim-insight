#!/usr/bin/env bash
# Which staging images a range of commits can affect, from the paths alone.
#
# Sourced by deploy.sh (for --build-local) and by ci/plan-images.sh (which
# decides what GitHub Actions builds). One copy of the rules, so the two can
# never disagree about what a change touches.
#
# Usage: changed_build_services <from-rev> <to-rev>
#   Needs REPO_ROOT set to the checkout.
# Contract — the EXIT STATUS is what the caller must branch on, not the output:
#   0  the printed list is complete. An EMPTY list genuinely means "no image
#      needs rebuilding" (a docs-only commit, or the same commit again).
#   1  the change set is not decidable from paths — rebuild everything.
#
# The status has to carry that distinction because "nothing to build" and
# "cannot tell, build it all" are both empty output and have opposite meanings.
# An earlier version printed an unguarded `"${!services[@]}"`, which on an empty
# associative array emits one BLANK line; mapfile read that as a single empty
# element, so redeploying an unchanged commit ran `dc build ""` and aborted the
# whole deployment on "no such service".
changed_build_services() {
  local previous_rev="$1" current_rev="$2" path svc
  local -A services=()
  # Every image assembled from the Node workspace.
  # risk-analyzer is NOT here: it is Python, has its own Dockerfile, and reads
  # nothing from the workspace, so no shared-package change can reach it.
  local workspace_images=(migrate api-gateway case-service video-service risk-engine edge)

  while IFS= read -r path; do
    case "$path" in
      # How CI assembles and packages the workspace images. Matched before
      # the .github/* rule below, which would otherwise wave it through.
      .github/workflows/staging-images.yml|deploy/staging/ci/*|deploy/staging/lib/*)
        for svc in "${workspace_images[@]}"; do services[$svc]=1; done ;;
      deploy/staging/runtime.Dockerfile)
        for svc in migrate api-gateway case-service video-service risk-engine; do services[$svc]=1; done ;;
      # The base under every Node service image: OpenSSL and curl.
      deploy/staging/node-base.Dockerfile)
        for svc in migrate api-gateway case-service video-service risk-engine; do services[$svc]=1; done ;;
      deploy/staging/edge.Dockerfile)
        services[edge]=1 ;;
      # Never enters an image: not in the build context (see .dockerignore) or
      # not read by anything at runtime. Rebuilding for these is pure waiting.
      docs/*|screenshots/*|.github/*|*.md|.gitignore|.gitattributes|.prettierrc)
        ;;
      # Read by the host at deploy time, never copied into an image.
      deploy/staging/deploy.sh|deploy/staging/ci-deploy.sh|deploy/staging/README*|deploy/staging/*.example)
        ;;
      apps/claimant-web/*|apps/adjuster-portal/*|deploy/staging/Caddyfile)
        services[edge]=1 ;;
      apps/api-gateway/*)
        services[api-gateway]=1 ;;
      apps/case-service/*)
        services[case-service]=1 ;;
      apps/video-service/*)
        services[video-service]=1 ;;
      apps/risk-engine/*)
        services[risk-engine]=1 ;;
      apps/risk-analyzer/*|deploy/staging/risk-analyzer.Dockerfile)
        services[risk-analyzer]=1 ;;
      # Shared packages go to exactly the images whose apps depend on them
      # (the @tci/* workspace dependencies in each package.json). A wider
      # list is safe and slow; a narrower one serves a stale package, so
      # keep these in step with those manifests.
      packages/ui-components/*)
        services[edge]=1 ;;
      packages/crypto/*)
        # prisma-client depends on crypto, so its consumers come along.
        for svc in migrate api-gateway case-service video-service risk-engine; do services[$svc]=1; done ;;
      packages/prisma-client/*)
        for svc in migrate api-gateway case-service video-service risk-engine; do services[$svc]=1; done ;;
      packages/shared-types/*)
        for svc in "${workspace_images[@]}"; do services[$svc]=1; done ;;
      # Root manifests, the lockfile and the Node Dockerfile shape every
      # workspace image — but still none of them is the Python one.
      package.json|pnpm-lock.yaml|pnpm-workspace.yaml|turbo.json|tsconfig.base.json|.dockerignore|deploy/staging/Dockerfile)
        for svc in "${workspace_images[@]}"; do services[$svc]=1; done ;;
      # Anything else (the compose files, a new top-level directory) cannot
      # be placed from its path alone. Falling back to a full build is
      # deliberate: a fast deployment must never serve a stale image.
      *)
        return 1 ;;
    esac
  done < <(git -C "$REPO_ROOT" diff --name-only "$previous_rev" "$current_rev")

  # Guarded: see the note above about the blank-line bug.
  if [[ ${#services[@]} -gt 0 ]]; then
    printf '%s\n' "${!services[@]}" | sort
  fi
}
