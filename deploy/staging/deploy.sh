#!/usr/bin/env bash
# ===========================================================================
# USAGE-START
# True Claim Insight — deploy to a shared host that already runs Traefik.
#
#   ./deploy.sh                  build changed images and (re)start the stack
#   ./deploy.sh --pull           git pull first, then the above
#   ./deploy.sh --no-build       restart without rebuilding (config changes)
#   ./deploy.sh --seed           ...and load demo data (safe: refuses if the
#                                database already has tenants)
#   ./deploy.sh --yes            never prompt (for non-interactive runs)
#   ./deploy.sh --status         what is running, without changing anything
#   ./deploy.sh --logs [svc]     follow logs
#   ./deploy.sh --down           stop TCI (leaves data volumes intact)
#   ./deploy.sh --help
# USAGE-END
#
# Safe to run repeatedly: it never regenerates secrets, never drops data, and
# never touches anything belonging to the co-tenant stack on this host.
#
# FIRST RUN ON A BARE SERVER — this script does not clone itself:
#   git clone <repo> /opt/true-claim-insight
#   cd /opt/true-claim-insight/deploy/staging && ./deploy.sh --seed
# Clone it; do not copy the tree from a Windows machine. Everything here is
# LF-only by .gitattributes, and a CRLF copy fails in ways that look like
# something else entirely (see the secret-shape check below).
#
# STAGING HOLDS SYNTHETIC DATA ONLY — seeded demo identities, never a real
# NRIC, recording or bank account (docs/MASTER_PLAN.md §8).
#
# Deviation on record: MASTER_PLAN §8 fixes staging as AWS ap-southeast-5
# (Malaysia). This host is a Singapore VPS shared with an unrelated ERP, used
# as a sandbox. Still offshore, so the synthetic-data-only rule is the control
# doing the work here, not the hosting location.
# ===========================================================================
set -euo pipefail

# --- Where this deployment answers ----------------------------------------
# sslip.io resolves <anything>.<ip>.sslip.io to that IP, with no account and
# no DNS to manage. Swapping to a real domain later means editing these three
# values plus their https:// twins in .env.staging and re-running — no rebuild.
#
# TCI_AGENT_FQDN must begin with "agent." — apps/claimant-web/src/lib/surface.ts
# selects the agent surface on that prefix and on nothing else.
TCI_HOST_IP="${TCI_HOST_IP:-89.233.105.237}"
TCI_ADJUSTER_FQDN="${TCI_ADJUSTER_FQDN:-adjuster.${TCI_HOST_IP}.sslip.io}"
TCI_CLAIMANT_FQDN="${TCI_CLAIMANT_FQDN:-claim.${TCI_HOST_IP}.sslip.io}"
TCI_AGENT_FQDN="${TCI_AGENT_FQDN:-agent.${TCI_HOST_IP}.sslip.io}"

# The co-tenant's Traefik network and ACME resolver. We attach and consume;
# we never reconfigure them.
TCI_TRAEFIK_NETWORK="${TCI_TRAEFIK_NETWORK:-frappe_docker_frappe_network}"
TCI_CERT_RESOLVER="${TCI_CERT_RESOLVER:-main-resolver}"

# Free memory the build needs. The build is unbounded by any container limit
# and is the phase most likely to trigger the kernel OOM killer on a swapless
# shared host — where the victim is chosen by size, i.e. the neighbour's DB.
# Sized against the Dockerfile's ceilings, and must be raised with them:
# TURBO_CONCURRENCY=3 compiling with a 2048 MB heap can want ~6 GB at peak.
MIN_BUILD_MEM_MB="${MIN_BUILD_MEM_MB:-6144}"
MIN_DISK_GB="${MIN_DISK_GB:-20}"

cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
ENV_FILE=".env.staging"
KEYS_ACK_MARKER=".keys-backed-up"
# This host has no swap and is shared with another stack. Two concurrent image
# builds compete for the same memory and can OOM the co-tenant database.
DEPLOY_LOCK_FILE="${TCI_DEPLOY_LOCK_FILE:-/tmp/tci-staging-deploy.lock}"

BASE_COMPOSE="docker-compose.staging.yml"
OVERLAY_COMPOSE="docker-compose.traefik.yml"

DO_PULL=0
DO_BUILD=1
DO_SEED=0
ASSUME_YES=0

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mABORTED:\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n'; bold "▸ $*"; }

# Delimited by markers, not line numbers: a line-range would silently print the
# wrong thing the first time anyone edits the header above.
usage() {
  sed -n '/^# USAGE-START$/,/^# USAGE-END$/p' "$0" | sed '1d;$d;s/^# \{0,1\}//'
  exit 0
}

# Any temp file this script makes holds secrets. One trap, whole script.
TMPFILES=()
# `return 0` is load-bearing, not tidiness. Written as
# `[[ ${#TMPFILES[@]} -gt 0 ]] && rm -f ...` the function ends on a false test
# whenever there is nothing to clean, so it returns 1 — and under `set -e` a
# failing last command in an EXIT trap replaces the status the script meant to
# exit with, including an explicit `exit 0`. Every successful run then reports
# failure, which is exactly as misleading as it sounds.
cleanup() {
  if [[ ${#TMPFILES[@]} -gt 0 ]]; then
    rm -f "${TMPFILES[@]}"
  fi
  return 0
}
trap cleanup EXIT
mktmp() { local t; t="$(mktemp)"; chmod 600 "$t"; TMPFILES+=("$t"); printf '%s' "$t"; }

# Compose always needs BOTH: --env-file for ${VAR} interpolation, and the
# per-service `env_file:` inside the base file for the container environment.
dc() {
  docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$OVERLAY_COMPOSE" "$@"
}

# ps / logs / down deliberately DROP the overlay. Those only need the project
# name (`name: tci-staging`), and the overlay's ${TCI_*_FQDN:?} would make an
# incomplete env file fatal — leaving a running stack that cannot be stopped
# by the tool that started it.
dc_admin() {
  docker compose --env-file "$ENV_FILE" -f "$BASE_COMPOSE" "$@"
}

require_env_file() {
  [[ -f "$ENV_FILE" ]] || die "no ${ENV_FILE} here — nothing has been deployed yet."
}

# Idempotent KEY=value write. Writes through a temp file and installs it with
# the mode intact, rather than truncating the live secrets file in place: a
# signal or a full disk mid-write would otherwise leave .env.staging empty,
# and generate-staging-secrets.sh refuses to recreate it.
set_env_var() {
  local key="$1" value="$2" tmp
  tmp="$(mktmp)"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" \
      'index($0, k "=") == 1 { print k "=" v; next } { print }' "$ENV_FILE" > "$tmp"
  else
    cp "$ENV_FILE" "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  install -m 600 "$tmp" "$ENV_FILE"
}

env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | head -n1; }

confirm() {
  local prompt="$1"
  [[ "$ASSUME_YES" -eq 1 ]] && return 0
  # `read` on a closed stdin returns non-zero, which under `set -e` would kill
  # the script silently — after secrets were already written.
  if [[ ! -t 0 ]]; then
    die "need to ask: ${prompt}
         stdin is not a terminal. Re-run interactively, or pass --yes."
  fi
  local reply
  read -r -p "  ${prompt} [y/N] " reply
  [[ "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]
}

# --- Arguments -------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pull)     DO_PULL=1; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    --seed)     DO_SEED=1; shift ;;
    --yes|-y)   ASSUME_YES=1; shift ;;
    --status)   require_env_file; dc_admin ps -a; exit 0 ;;
    --logs)     shift; require_env_file; dc_admin logs -f --tail=100 "$@"; exit 0 ;;
    --down)     require_env_file; dc_admin down
                echo "Stopped. Data volumes kept — './deploy.sh' brings it back."; exit 0 ;;
    -h|--help)  usage ;;
    *)          die "Unknown option: $1  (try --help)" ;;
  esac
done

# Hold the lock for the entire rollout. It is deliberately non-blocking: a
# queued second deployment is stale by definition, and waiting can make an
# operator believe it has already started. `flock` releases FD 9 on exit.
command -v flock >/dev/null || die "flock is required to prevent concurrent deployments."
exec 9>"$DEPLOY_LOCK_FILE"
flock -n 9 || die "another TCI deployment is already running.
       Wait for it to finish, then re-run ./deploy.sh."

bold "True Claim Insight — deploy"
info "host      $(hostname) (${TCI_HOST_IP})"
info "repo      ${REPO_ROOT}"
info "adjuster  https://${TCI_ADJUSTER_FQDN}"
info "claimant  https://${TCI_CLAIMANT_FQDN}"
info "agent     https://${TCI_AGENT_FQDN}"

# --- 1. Preflight ----------------------------------------------------------
step "Checking the host"

command -v docker >/dev/null || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "the 'docker compose' v2 plugin is missing."
command -v python3 >/dev/null || die "python3 is required (the port guard parses compose's JSON with it)."

# `!override` in the overlay needs Compose >= 2.24. Without it the empty port
# list would MERGE with the base list instead of replacing it, and the stack
# would try to bind :80 — the co-tenant's port.
compose_version="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
compose_major="${compose_version%%.*}"
compose_rest="${compose_version#*.}"
compose_minor="${compose_rest%%.*}"
if [[ "${compose_major:-0}" -lt 2 ]] || { [[ "${compose_major:-0}" -eq 2 ]] && [[ "${compose_minor:-0}" -lt 24 ]]; }; then
  die "Compose ${compose_version} is too old; ${OVERLAY_COMPOSE} needs >= 2.24 for '!override'."
fi
ok "docker compose ${compose_version}"

[[ -x ./generate-staging-secrets.sh ]] || die "generate-staging-secrets.sh is not executable.
         chmod +x generate-staging-secrets.sh
         (A copy from Windows drops the bit; a git clone preserves it.)"

docker network inspect "$TCI_TRAEFIK_NETWORK" >/dev/null 2>&1 \
  || die "Traefik network '${TCI_TRAEFIK_NETWORK}' not found.
         The overlay attaches to a network the co-tenant stack owns. If that
         stack is down or renamed, start it or set TCI_TRAEFIK_NETWORK."
ok "Traefik network '${TCI_TRAEFIK_NETWORK}' present"

# The build fills Docker's data root, which is frequently NOT the filesystem
# the repo sits on.
docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
avail_gb=$(( $(df -Pk "$docker_root" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
if [[ "$avail_gb" -lt "$MIN_DISK_GB" ]]; then
  die "only ${avail_gb} GB free on ${docker_root} (need ${MIN_DISK_GB} GB).
       Filling this filesystem stops the co-tenant's database, not just us."
fi
ok "disk: ${avail_gb} GB free on ${docker_root}"

if ! swapon --show 2>/dev/null | grep -q .; then
  info "no swap on this host — memory ceilings are load-bearing, not decorative"
fi

# --- 2. Source code --------------------------------------------------------
# This checkout is a deployment target, not a second source of truth.  It does
# keep generated secrets in .env.staging (which Git ignores), but a hand edit
# to a tracked file, or an untracked file which a new revision introduces,
# used to make `git pull` abort and leave the deploy stranded. Preserve both
# in a named stash before pulling. We deliberately do not
# pop it afterwards: the image must be built from the reviewed GitHub revision,
# and applying an old server patch over new code can quietly undo a fix.
stash_server_changes_before_pull() {
  local stamp stash_ref

  if [[ -z "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=normal)" ]]; then
    return 0
  fi

  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  warn "server checkout has changes; saving them before pulling"
  git -C "$REPO_ROOT" status --short | sed 's/^/      /'
  # --include-untracked deliberately excludes ignored runtime state such as
  # .env.staging and Docker-related local files.
  git -C "$REPO_ROOT" stash push --include-untracked -m "tci-deploy-before-pull-${stamp}" \
    || die "could not preserve the server changes; nothing was pulled."
  stash_ref="$(git -C "$REPO_ROOT" stash list -1 --format='%gd')"
  [[ -n "$stash_ref" ]] || die "server changes were not saved; nothing was pulled."
  ok "saved server edits as ${stash_ref}"
  info "review or recover them later: cd ${REPO_ROOT} && git stash show -p ${stash_ref}"
}

if [[ "$DO_PULL" -eq 1 ]]; then
  step "Updating the source"
  stash_server_changes_before_pull
  git -C "$REPO_ROOT" pull --ff-only
  ok "pulled"
fi

# --- 3. Secrets and hostnames ---------------------------------------------
step "Checking configuration"

FIRST_RUN=0
if [[ ! -f "$ENV_FILE" ]]; then
  FIRST_RUN=1
  info "no ${ENV_FILE} yet — generating fresh secrets"
  ./generate-staging-secrets.sh >/dev/null
  ok "generated ${ENV_FILE} (mode 600)"

  # Caddy site addresses take the http:// form so it serves plain HTTP and
  # attempts no certificate — Traefik in front holds the cert. The *_ORIGIN
  # values stay https:// because they describe what the browser sees, and
  # they are what CORS and the public file URLs are built from.
  set_env_var ADJUSTER_HOST "http://${TCI_ADJUSTER_FQDN}"
  set_env_var CLAIMANT_HOST "http://${TCI_CLAIMANT_FQDN}"
  set_env_var AGENT_HOST    "http://${TCI_AGENT_FQDN}"
  set_env_var ADJUSTER_ORIGIN "https://${TCI_ADJUSTER_FQDN}"
  set_env_var CLAIMANT_ORIGIN "https://${TCI_CLAIMANT_FQDN}"
  set_env_var AGENT_ORIGIN    "https://${TCI_AGENT_FQDN}"

  # Bare names for Traefik's Host() matcher — same hosts, no scheme.
  set_env_var TCI_ADJUSTER_FQDN "$TCI_ADJUSTER_FQDN"
  set_env_var TCI_CLAIMANT_FQDN "$TCI_CLAIMANT_FQDN"
  set_env_var TCI_AGENT_FQDN    "$TCI_AGENT_FQDN"
  set_env_var TCI_TRAEFIK_NETWORK "$TCI_TRAEFIK_NETWORK"
  set_env_var TCI_CERT_RESOLVER   "$TCI_CERT_RESOLVER"

  # Unused once the overlay empties the port list, but pinned to loopback so
  # that if the overlay is ever dropped by mistake the fallback is a local
  # bind rather than a grab at the co-tenant's :80.
  set_env_var CADDY_HTTP_PORT  "127.0.0.1:18080"
  set_env_var CADDY_HTTPS_PORT "127.0.0.1:18443"
  ok "hostnames written"
else
  ok "${ENV_FILE} exists — leaving secrets untouched"
fi

# Shape, not merely presence. A CRLF-mangled example file yields lines like
# `JWT_SECRET=\r`, which is non-empty: it satisfies both a `.+` check and
# compose's ${VAR:?}, and the stack boots with a one-byte master key.
for required in POSTGRES_PASSWORD JWT_SECRET COOKIE_SECRET INTERNAL_API_KEY; do
  [[ "$(env_value "$required" | tr -d '\r' | wc -c)" -ge 20 ]] \
    || die "${required} in ${ENV_FILE} is missing or too short.
           If this file was created from a CRLF copy of the example, delete it
           and re-run from a git clone."
done
for required in ENCRYPTION_MASTER_KEY NRIC_INDEX_PEPPER; do
  env_value "$required" | tr -d '\r' | grep -qE '^[A-Za-z0-9+/]{40,}={0,2}$' \
    || die "${required} is not a valid base64 key. See the note above about CRLF."
done
ok "secrets present and well-formed"

for required in ADJUSTER_HOST CLAIMANT_HOST AGENT_HOST; do
  env_value "$required" | grep -qE '^http://' \
    || die "${required} must start with http:// on this host.
           Behind Traefik, Caddy serves plain HTTP and Traefik holds the
           certificate. Without the scheme Caddy treats the value as a TLS
           site, attempts its own ACME on ports Traefik never forwards, and
           serves nothing — a 502 with no explanation."
done
for required in ADJUSTER_ORIGIN CLAIMANT_ORIGIN AGENT_ORIGIN \
                TCI_ADJUSTER_FQDN TCI_CLAIMANT_FQDN TCI_AGENT_FQDN; do
  [[ -n "$(env_value "$required")" ]] || die "${required} is empty in ${ENV_FILE}."
done
# The agent host no longer has to start with `agent.` — the overlay passes it
# to the build as VITE_AGENT_HOSTS, and surfaceFor() matches it by name. What
# still has to hold is that it is a DIFFERENT name from the claimant host: the
# two surfaces are one build, told apart only by which address served them, so
# giving them the same name serves the agent screens to claimants.
if [[ "$(env_value TCI_AGENT_FQDN)" == "$(env_value TCI_CLAIMANT_FQDN)" ]]; then
  die "TCI_AGENT_FQDN and TCI_CLAIMANT_FQDN are the same host.
       They select which surface the shared build shows, so one name cannot
       serve both — the agent surface skips the code sent to the claimant's
       own phone."
fi
ok "hostnames well-formed"

# Record the key-backup acknowledgement automatically. This deployment is
# intentionally non-interactive, so a confirmation prompt must never leave a
# rollout paused on an unattended terminal. The marker is runtime state and
# is ignored by Git.
if [[ ! -f "$KEYS_ACK_MARKER" ]]; then
  date -u +'acknowledged automatically %Y-%m-%dT%H:%M:%SZ' > "$KEYS_ACK_MARKER"
  chmod 600 "$KEYS_ACK_MARKER"
  ok "key-backup acknowledgement recorded automatically"
fi

# --- 4. DNS ----------------------------------------------------------------
# A wrong IP produces names that resolve somewhere else entirely; the deploy
# still "succeeds" and the certificate simply never arrives.
step "Checking DNS"

# Collect this host's addresses ONCE, as a list, and compare exactly. Grepping
# the raw `ip addr` output for a dotted quad is unreliable twice over: the dots
# are regex wildcards, and -w's word boundaries interact with the /prefix and
# whitespace differently depending on how the address is rendered. That showed
# up as the same IP passing for two names and failing for a third in one run.
host_addrs=" $(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}' | tr '\n' ' ')"

for fqdn in "$(env_value TCI_ADJUSTER_FQDN)" "$(env_value TCI_CLAIMANT_FQDN)" "$(env_value TCI_AGENT_FQDN)"; do
  # Take every A record, not just the first: a name may legitimately carry
  # several, and matching any one of them is what we care about.
  resolved="$(getent ahostsv4 "$fqdn" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  resolved="${resolved% }"
  if [[ -z "$resolved" ]]; then
    die "${fqdn} does not resolve. Traefik cannot obtain a certificate for a
         name that does not exist."
  fi

  matched=0
  for ip_addr in $resolved; do
    [[ "$host_addrs" == *" ${ip_addr} "* ]] && matched=1
  done

  if [[ "$matched" -eq 1 ]]; then
    ok "${fqdn} → ${resolved} (an address on this host)"
  else
    warn "${fqdn} → ${resolved}, which is not an address on this host.
    If that is a NAT or floating IP this is fine; if it is wrong, the
    certificate will never be issued."
  fi
done

# --- 5. The port guard -----------------------------------------------------
# The single check that protects the co-tenant. UFW's default incoming policy
# on this host is ALLOW and Docker publishes ports below UFW, so a published
# port is world-reachable the moment it exists. Parsed from JSON rather than
# grepped: a service with `ports: ["9090"]` renders no `published:` key at all
# yet still gets a random world-reachable host port, and `network_mode: host`
# renders no ports section while binding every listener to the host directly.
step "Verifying no port would be exposed"

config_json="$(mktmp)"
dc config --format json > "$config_json" \
  || die "compose config failed — see the error above."

python3 - "$config_json" <<'PY' || die "refusing to start; nothing has been changed."
import json, sys

with open(sys.argv[1]) as fh:
    cfg = json.load(fh)

services = cfg.get("services") or {}
problems = []

for name, svc in services.items():
    mode = svc.get("network_mode")
    if mode and (mode == "host" or str(mode).startswith("container:")):
        problems.append(f"{name}: network_mode={mode} bypasses container networking")
    for port in svc.get("ports") or []:
        problems.append(f"{name}: publishes {port}")

edge = services.get("edge") or {}
if "traefik" not in (edge.get("networks") or {}):
    problems.append("edge is not attached to the traefik network — Traefik could not reach it")

if problems:
    print("\n".join("      " + p for p in problems), file=sys.stderr)
    sys.exit(1)

print(f"      {len(services)} services, none publishing a host port")
PY
ok "no host ports published — reachable only through Traefik"

# --- 6. Build --------------------------------------------------------------
if [[ "$DO_BUILD" -eq 1 ]]; then
  step "Building images"

  # The build is the one phase no mem_limit covers: it happens before any
  # container exists. On a swapless host the kernel picks the largest process
  # to kill, which here is the co-tenant's MariaDB.
  mem_avail_mb=$(( $(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0) / 1024 ))
  if [[ "$mem_avail_mb" -lt "$MIN_BUILD_MEM_MB" ]]; then
    die "only ${mem_avail_mb} MB available; the build needs ~${MIN_BUILD_MEM_MB} MB.
       Building anyway risks the kernel killing the largest process on this
       host — which is the co-tenant's database, not this build.
       Wait for load to drop, or build elsewhere and 'docker load' the images."
  fi
  ok "${mem_avail_mb} MB available for the build"

  info "first build takes 5-15 minutes; later ones reuse cached layers"
  info "turbo concurrency and Node heap are capped in the Dockerfile"
  dc build
  ok "images built"
fi

# --- 7. Start --------------------------------------------------------------
# `up -d` also runs the one-shot migrate service, which applies committed
# Prisma migrations and exits. The four Node services gate on it completing,
# so they never start against an un-migrated database.
step "Starting the stack"
dc up -d --remove-orphans
ok "containers up; migrations applied"

# --- 8. Wait for health ----------------------------------------------------
# Read each container's own health state rather than string-matching the output
# of `docker compose ps`. Three reasons, all learned the hard way:
#   - "unhealthy" CONTAINS "healthy", so a `grep -v healthy` filter drops the
#     one status that matters and reports a broken service as fine.
#   - `docker compose ps --format` rejects a bare Go template.
#   - a container that exited does not appear in `ps` at all, so absence read
#     as success turns a crash into a clean deploy.
step "Waiting for services to report healthy"

HEALTHCHECKED_SERVICES=(api-gateway case-service video-service risk-analyzer)

service_health() {
  local svc="$1" cid state health
  cid="$(dc_admin ps -aq "$svc" 2>/dev/null | head -n1)"
  [[ -z "$cid" ]] && { echo "not-created"; return; }
  state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo gone)"
  [[ "$state" == "running" ]] || { echo "$state"; return; }
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null || echo gone)"
  echo "$health"
}

deadline=$(( SECONDS + 300 ))
pending=()
while :; do
  pending=()
  for svc in "${HEALTHCHECKED_SERVICES[@]}"; do
    [[ "$(service_health "$svc")" == "healthy" ]] || pending+=("$svc")
  done
  [[ ${#pending[@]} -eq 0 ]] && break
  (( SECONDS >= deadline )) && break
  sleep 5
done

if [[ ${#pending[@]} -eq 0 ]]; then
  ok "all health-checked services healthy"
else
  warn "still not healthy after 5 minutes — the stack is up but suspect:"
  for svc in "${pending[@]}"; do
    printf '      %-16s %s\n' "$svc" "$(service_health "$svc")"
  done
  warn "look at why with:  ./deploy.sh --logs ${pending[0]}"
  warn "exit 137 in the logs means the container hit its mem_limit."
fi

# --- 9. Seed (first run only) ---------------------------------------------
psql_tci() { dc_admin exec -T postgres psql -U tci -d true_claim_insight -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

if [[ "$DO_SEED" -eq 1 ]]; then
  step "Seeding demo data"
  existing="$(psql_tci "select count(*) from tenants" || echo "")"
  if [[ "$existing" =~ ^[0-9]+$ ]] && [[ "$existing" -gt 0 ]]; then
    warn "database already holds ${existing} tenants — not seeding again."
    info "seeding twice duplicates data or fails on a unique constraint."
  else
    warn "synthetic identities only — never real claimant data"
    dc run --rm migrate pnpm seed || die "seed failed; see the output above."
    ok "seeded"
  fi
fi

# HANDLING_FIRM_TENANT_ID gates claimant self-service and agent-assisted
# intake. Unset, the services only WARN — so the stack looks perfectly healthy
# while both intake paths dead-end. Read it from the database rather than
# asking someone to find a uuid in the scrollback.
if [[ -z "$(env_value HANDLING_FIRM_TENANT_ID)" ]]; then
  tenant_id="$(psql_tci "select id from tenants where type = 'ADJUSTING_FIRM' limit 1" || echo "")"
  if [[ "$tenant_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    step "Wiring the handling firm"
    set_env_var HANDLING_FIRM_TENANT_ID "$tenant_id"
    ok "HANDLING_FIRM_TENANT_ID=${tenant_id}"
    info "restarting the services that read it..."
    dc up -d api-gateway case-service
    ok "applied"
  else
    warn "HANDLING_FIRM_TENANT_ID is unset and no ADJUSTING_FIRM tenant exists yet."
    info "claimant and agent intake will dead-end until it is set."
    info "run ./deploy.sh --no-build --seed to create one."
  fi
fi

# --- 10. Report ------------------------------------------------------------
step "Result"
dc_admin ps -a

printf '\n'
info "Checking the public route through Traefik..."
# No `|| echo 000`: curl already prints 000 on failure, and appending a second
# one produced "000\n000", which matched no case below.
edge_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
  "https://$(env_value TCI_CLAIMANT_FQDN)/" 2>/dev/null || true)"
case "${edge_status:-000}" in
  000|"") warn "no answer yet. Traefik requests the certificate on the first hit,
    which can take a minute. Retry:
      curl -I https://$(env_value TCI_CLAIMANT_FQDN)/
    If it never succeeds, check that the co-tenant's '${TCI_CERT_RESOLVER}'
    uses an HTTP-01 challenge — a DNS-01 resolver cannot issue for sslip.io." ;;
  2*|3*) ok "claimant app answering over HTTPS (${edge_status})" ;;
  *) warn "claimant host returned HTTP ${edge_status} — check ./deploy.sh --logs edge" ;;
esac

printf '\n'
bold "Open these:"
info "adjuster portal   https://$(env_value TCI_ADJUSTER_FQDN)"
info "claimant app      https://$(env_value TCI_CLAIMANT_FQDN)"
info "agent form        https://$(env_value TCI_AGENT_FQDN)"
if [[ "$FIRST_RUN" -eq 1 && "$DO_SEED" -eq 0 ]]; then
  printf '\n'
  warn "database is empty — no users exist yet. Load the demo data with:"
  info "    ./deploy.sh --no-build --seed"
fi
printf '\n'
info "logs:    ./deploy.sh --logs [service]"
info "status:  ./deploy.sh --status"
info "stop:    ./deploy.sh --down"
printf '\n'
