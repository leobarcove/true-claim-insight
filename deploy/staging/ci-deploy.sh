#!/usr/bin/env bash
# The ONLY thing the CI deploy key can run on this host.
#
# Installed as a forced command in /root/.ssh/authorized_keys:
#   command="/opt/true-claim-insight/deploy/staging/ci-deploy.sh",no-pty,
#   no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 … tci-ci-deploy
# so whatever the client asks to run, sshd runs this instead. The host is
# shared with another stack; a key stored in GitHub must not be a root shell.
#
# stdin, line 1: a registry token (the workflow's own GITHUB_TOKEN, which
# expires when the job ends). It is written only to a throwaway Docker config
# that is deleted on exit, so no registry credential outlives the deploy.
set -euo pipefail

IFS= read -r -t 10 token || { echo "ci-deploy: expected a registry token on stdin" >&2; exit 2; }
[[ "$token" =~ ^[A-Za-z0-9_]+$ ]] || { echo "ci-deploy: malformed token" >&2; exit 2; }

DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
# Compose and buildx are CLI plugins found via DOCKER_CONFIG; point the
# throwaway config at the system's plugins so `docker compose` still exists.
ln -s /usr/libexec/docker/cli-plugins "$DOCKER_CONFIG/cli-plugins" 2>/dev/null \
  || ln -s /usr/lib/docker/cli-plugins "$DOCKER_CONFIG/cli-plugins"

printf '%s' "$token" | docker login ghcr.io -u ci --password-stdin >/dev/null

cd "$(dirname "$0")"
# Not `exec`: the EXIT trap that deletes the credential must still run.
./deploy.sh --pull --yes
