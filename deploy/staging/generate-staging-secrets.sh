#!/usr/bin/env bash
# Creates deploy/staging/.env.staging from the example, with every secret
# freshly generated. Refuses to overwrite an existing file: regenerating the
# master key over live data makes that data unrecoverable.
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=".env.staging"
EXAMPLE_FILE=".env.staging.example"

if [[ -e "$ENV_FILE" ]]; then
  echo "REFUSING: $ENV_FILE already exists." >&2
  echo "If you truly want fresh secrets, move the old file aside yourself —" >&2
  echo "and understand that a new ENCRYPTION_MASTER_KEY makes existing" >&2
  echo "encrypted data unrecoverable." >&2
  exit 1
fi

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "Missing $EXAMPLE_FILE" >&2
  exit 1
fi

b64_32() { openssl rand -base64 32; }
urlsafe_48() { openssl rand -base64 48 | tr '+/' '-_' | tr -d '='; }

POSTGRES_PASSWORD="$(urlsafe_48)"
JWT_SECRET="$(urlsafe_48)"
COOKIE_SECRET="$(urlsafe_48)"
INTERNAL_API_KEY="$(urlsafe_48)"
ENCRYPTION_MASTER_KEY="$(b64_32)"
NRIC_INDEX_PEPPER="$(b64_32)"

# Fill only the empty secret slots; everything else passes through verbatim.
awk \
  -v pg="$POSTGRES_PASSWORD" \
  -v jwt="$JWT_SECRET" \
  -v cookie="$COOKIE_SECRET" \
  -v internal="$INTERNAL_API_KEY" \
  -v master="$ENCRYPTION_MASTER_KEY" \
  -v pepper="$NRIC_INDEX_PEPPER" '
  /^POSTGRES_PASSWORD=$/      { print "POSTGRES_PASSWORD=" pg; next }
  /^JWT_SECRET=$/             { print "JWT_SECRET=" jwt; next }
  /^COOKIE_SECRET=$/          { print "COOKIE_SECRET=" cookie; next }
  /^INTERNAL_API_KEY=$/       { print "INTERNAL_API_KEY=" internal; next }
  /^ENCRYPTION_MASTER_KEY=$/  { print "ENCRYPTION_MASTER_KEY=" master; next }
  /^NRIC_INDEX_PEPPER=$/      { print "NRIC_INDEX_PEPPER=" pepper; next }
  { print }
' "$EXAMPLE_FILE" > "$ENV_FILE"

chmod 600 "$ENV_FILE"

echo "Wrote $ENV_FILE (mode 600) with fresh secrets."
echo
echo "BEFORE FIRST BOOT, do these by hand:"
echo "  1. Store ENCRYPTION_MASTER_KEY and NRIC_INDEX_PEPPER in the password"
echo "     manager — losing them makes encrypted staging data unrecoverable."
echo "  2. Set ADJUSTER_HOST / CLAIMANT_HOST / *_ORIGIN to the real staging"
echo "     domains (or http://*.localhost for a local run)."
echo "  3. After seeding, fill HANDLING_FIRM_TENANT_ID."
