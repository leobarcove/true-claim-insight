#!/usr/bin/env bash
# ===========================================================================
# USAGE-START
# True Claim Insight — deploy to the staging sandbox from your own machine.
#
# Run this from the project root. It does not deploy anything by itself: it
# connects to the server and runs the real deploy script there, streaming the
# output back. You never need to ssh in by hand.
#
#   ./deploy.sh                  deploy the latest pushed code (the usual one)
#   ./deploy.sh --status         what is running on the server
#   ./deploy.sh --logs           watch all logs        (Ctrl-C to stop)
#   ./deploy.sh --logs api-gateway   watch one service
#   ./deploy.sh --no-build       restart without rebuilding
#   ./deploy.sh --down           stop the sandbox (data is kept)
#   ./deploy.sh --otp            show the most recent sign-in codes
#   ./deploy.sh --ssh            just open a shell on the server
#   ./deploy.sh --help
#
# Any other flag is passed straight through to the server-side script; see
# deploy/staging/deploy.sh --help for the full set.
# USAGE-END
#
# WHY THERE ARE TWO deploy.sh FILES
#   this one            drives the deploy from your laptop, over ssh
#   deploy/staging/     does the actual work, and runs ON the server
# The server one is the real thing. This is a remote control for it.
#
# Full explanation of the setup: docs/STAGING_SANDBOX_RUNBOOK.md
# ===========================================================================
set -euo pipefail

SERVER="${TCI_SERVER:-root@89.233.105.237}"
SSH_KEY="${TCI_SSH_KEY:-$HOME/.ssh/id_rsa_fitarch}"
REMOTE_DIR="${TCI_REMOTE_DIR:-/opt/true-claim-insight}"
BRANCH="${TCI_BRANCH:-main}"

cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '/^# USAGE-START$/,/^# USAGE-END$/p' "$0" | sed '1d;$d;s/^# \{0,1\}//'
  exit 0
}

case "${1:-}" in
  -h|--help) usage ;;
  --ssh) exec ssh -i "$SSH_KEY" -t "$SERVER" "cd ${REMOTE_DIR}/deploy/staging && exec bash -l" ;;
  # Sign-in codes. Nothing sends them on this host — there is no WhatsApp
  # account — so the app hands the code back in its own response and the row
  # below is the other place to find it. Claimant and agent sign-in both land
  # here; the phone number tells you which.
  --otp)
    exec ssh -i "$SSH_KEY" "$SERVER" \
      "cd ${REMOTE_DIR}/deploy/staging && docker compose --env-file .env.staging \
       -f docker-compose.staging.yml exec -T postgres psql -U tci -d true_claim_insight \
       -c 'select \"phoneNumber\", code, \"expiresAt\" at time zone '\\''UTC'\\'' as expires_utc \
           from otp_codes order by \"createdAt\" desc limit 5'"
    ;;
esac

[[ -f "$SSH_KEY" ]] || die "no ssh key at ${SSH_KEY}
       Set TCI_SSH_KEY=/path/to/key if it lives somewhere else."

bold "Deploying True Claim Insight → ${SERVER}"

# --- Is the code you are deploying actually the code you have? -------------
# The server deploys by pulling from GitHub. Anything you have not pushed is
# invisible to it, and the deploy would quietly ship the previous version — the
# kind of failure that costs an hour before anyone suspects it.
if [[ $# -eq 0 || "${1:-}" == "--pull" ]]; then
  printf '\n'; bold "▸ Checking your working copy"

  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    warn "you have uncommitted changes — these will NOT be deployed:"
    git status --short | head -8 | sed 's/^/      /'
    info "continuing; the server deploys only committed, pushed code"
  else
    ok "working copy is clean"
  fi

  git fetch -q origin "$BRANCH" 2>/dev/null || warn "could not reach GitHub to check for unpushed work"
  unpushed="$(git log --oneline "origin/${BRANCH}..HEAD" 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${unpushed:-0}" -gt 0 ]]; then
    warn "${unpushed} commit(s) are not on GitHub yet:"
    git log --oneline "origin/${BRANCH}..HEAD" | head -5 | sed 's/^/      /'
    printf '\n'
    info "The server pulls from GitHub, so it cannot see these."
    if [[ -t 0 ]] && read -r -p "  Push them now? [Y/n] " reply && [[ ! "$reply" =~ ^[Nn]$ ]]; then
      git push origin "$BRANCH" || die "push failed — see the error above.
       If it says 'Permission denied', your GitHub account lacks write access
       to this repository; nothing was deployed."
      ok "pushed"
    else
      die "Nothing deployed. Push first, or the server would ship older code."
    fi
  else
    ok "GitHub is up to date with your branch"
  fi
fi

# --- Hand over to the real script on the server -----------------------------
# No arguments means a full deploy, which for a remote run means pulling first —
# otherwise the server would rebuild whatever it happened to have.
if [[ $# -eq 0 ]]; then
  set -- --pull
fi

printf '\n'
bold "▸ Running on the server: ./deploy.sh $*"
info "(everything below is coming from ${SERVER})"
printf '\n'

# -t gives a terminal on the far side, so Ctrl-C reaches `--logs` and progress
# output arrives live instead of in one lump at the end.
exec ssh -i "$SSH_KEY" -t "$SERVER" \
  "cd ${REMOTE_DIR}/deploy/staging && ./deploy.sh $*"
