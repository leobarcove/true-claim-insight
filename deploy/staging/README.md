# Staging deployment — AWS EC2, ap-southeast-5 (Malaysia)

Staging runs the whole platform on **one EC2 instance in the AWS Malaysia
region** — the production target region — so the residency story, and later
the KMS/SES paths, are rehearsed rather than deferred (decision recorded in
`docs/MASTER_PLAN.md` §8, 31 July 2026).

> **Rule: staging holds synthetic data only.** Seeded demo identities, never
> a real NRIC, recording or bank account. This is discipline, not law — the
> box is in-country — but it keeps staging disposable and demo-safe.

## What runs where

| Container | Image target | Exposed |
| --- | --- | --- |
| `edge` (Caddy) | `Dockerfile` → `edge` | **80/443 — the only published ports** |
| `api-gateway` | `Dockerfile` → `api-gateway` | compose network only |
| `case-service` | `Dockerfile` → `case-service` | compose network only |
| `video-service` | `Dockerfile` → `video-service` | compose network only |
| `risk-engine` | `Dockerfile` → `risk-engine` | compose network only |
| `risk-analyzer` | `risk-analyzer.Dockerfile` | compose network only |
| `migrate` (one-shot) | `Dockerfile` → `migrate` | exits after `prisma migrate deploy` |
| `postgres`, `redis` | stock images | compose network only |

The edge serves the adjuster portal on `ADJUSTER_HOST`, the claimant PWA on
`CLAIMANT_HOST`, the same claimant build again on `AGENT_HOST` for the
agent-assisted form, proxies `/api/*` to the gateway, and exposes locally-stored
files under `/case-files/*` and `/risk-files/*`. Both frontends are built
with `VITE_API_URL=/api/v1`, so API traffic is same-origin — no CORS in the
normal path.

## Provisioning (once)

1. **Instance**: EC2 in `ap-southeast-5`, Ubuntu 24.04 LTS, x86
   (`c7i.xlarge` 4 vCPU/8 GB recommended; `m7i-flex.large` 2 vCPU/8 GB if
   one-session-at-a-time is enough — skip ARM/Graviton for MediaPipe's sake),
   **gp3 EBS ≥100 GB**, an Elastic IP.
2. **Security group**: inbound 22 (your IP only), 80, 443. Nothing else —
   Postgres/Redis are never published.
3. **DNS**: A records for the three hosts (e.g. `adjuster.staging.…`, `agent.staging.…` and
   `claim.staging.…`) → the Elastic IP. Caddy then obtains TLS certificates
   automatically on first request.
4. **Docker**: install Docker Engine + compose plugin (`apt-get install
   docker.io docker-compose-v2` or Docker's apt repo), add your user to the
   `docker` group.
5. **Code**: `git clone` the repository (deploy key or HTTPS token).

## First deploy

```bash
cd true-claim-insight/deploy/staging
./generate-staging-secrets.sh          # writes .env.staging, mode 600
# → store ENCRYPTION_MASTER_KEY + NRIC_INDEX_PEPPER in the password manager
# → set ADJUSTER_HOST / CLAIMANT_HOST / AGENT_HOST / *_ORIGIN to the real domains

docker compose --env-file .env.staging -f docker-compose.staging.yml build
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d

# Seeding is deliberate and manual (synthetic demo data):
docker compose --env-file .env.staging -f docker-compose.staging.yml \
  run --rm migrate pnpm seed
# → the seed prints the ADJUSTING_FIRM tenant id at the end; copy it into
#   HANDLING_FIRM_TENANT_ID in .env.staging, then:
docker compose --env-file .env.staging -f docker-compose.staging.yml \
  up -d api-gateway case-service
```

## Redeploy after a code change

```bash
git pull
docker compose --env-file .env.staging -f docker-compose.staging.yml build
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
```

`migrate` runs committed Prisma migrations on every `up` and is a no-op when
there is nothing new. (Migrations are still **authored** locally, never on
this box.)

## Telegram on staging

The channel is off until staging has a bot of its own. Three facts decide the
setup, and each is enforced by the code rather than by convention:

- **One bot per environment.** Long-polling is a singleton per token: two
  pollers each receive half the updates, and claimants appear intermittently
  ignored. Create a staging-only bot with @BotFather and put its token in
  `TELEGRAM_BOT_TOKEN`. The development bot stays on the developer's machine.
- **Polling is opt-in.** `TELEGRAM_POLLING_ENABLED=true` is the template
  default for staging because it runs exactly one case-service. Polling is
  outbound only, so the edge needs no route and the security group no change.
- **The Mini App origin is derived, not typed.** Compose sets
  `CLAIMANT_WEB_URL` from `CLAIMANT_ORIGIN`, and the bot offers the
  *Open the form* button only for an `https://` origin. On a local dry-run with
  `http://claim.localhost` the button simply does not appear.

```bash
# after filling TELEGRAM_BOT_TOKEN in .env.staging:
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d case-service
docker compose --env-file .env.staging -f docker-compose.staging.yml logs case-service | grep -i telegram
# expect: "Telegram long-polling started."
# a 409 in the log means another poller holds this token — the wrong token was used.
```

## WhatsApp on staging

Meta delivers to **one callback URL per app**, so the WhatsApp Business Account
can feed either the developer's tunnel or staging, never both. Three steps, in
this order — the second fails if the first has not happened:

1. Fill the `WHATSAPP_*` block in `.env.staging` (both `case-service` and
   `api-gateway` read it; the gateway then sends real login codes by WhatsApp
   instead of printing them to its log) and recreate those two services.
2. Prove the handshake from outside before touching Meta:
   `curl "https://<adjuster-host>/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_WEBHOOK_VERIFY_TOKEN>&hub.challenge=12345"`
   must return `12345`; a wrong token must return 403.
3. Repoint the subscription. The console works; so does the Graph API, which
   is reproducible and preserves the event fields:

   ```bash
   # AT is the app access token: "<app-id>|<WHATSAPP_APP_SECRET>"
   curl -s "https://graph.facebook.com/v21.0/<app-id>/subscriptions?access_token=$AT"   # read current fields
   curl -s -X POST "https://graph.facebook.com/v21.0/<app-id>/subscriptions" \
     --data-urlencode object=whatsapp_business_account \
     --data-urlencode callback_url=https://<adjuster-host>/api/webhooks/whatsapp \
     --data-urlencode verify_token=<WHATSAPP_WEBHOOK_VERIFY_TOKEN> \
     --data-urlencode "fields=<the comma-separated list read above>" \
     --data-urlencode access_token=$AT
   ```

   Meta performs the GET handshake against the new URL inside that call and
   answers `{"success":true}` only if it passed. Pointing back at the tunnel is
   the same call with the old URL.

With `NODE_ENV=staging` (the Traefik overlay) the sender allowlist is live, so
`WHATSAPP_ALLOWED_SENDERS` must name the tester numbers or inbound messages are
dropped with an error in the case-service log.

## Local dry-run of this stack

Works on a dev machine without DNS or sudo ports:

```ini
ADJUSTER_HOST=http://adjuster.localhost
CLAIMANT_HOST=http://claim.localhost
# The agent-assisted form. Same build as CLAIMANT_HOST — the hostname is what
# selects the surface, so this must be its own name and not a path.
AGENT_HOST=http://agent.localhost
ADJUSTER_ORIGIN=http://adjuster.localhost:8088
CLAIMANT_ORIGIN=http://claim.localhost:8088
AGENT_ORIGIN=http://agent.localhost:8088
CADDY_HTTP_PORT=8088
CADDY_HTTPS_PORT=8443
```

Then `curl -H 'Host: adjuster.localhost' http://localhost:8088/api/v1/health`.
The dev docker-compose stack (Postgres 5435 etc.) can keep running — nothing
collides.

## Deliberate omissions

- **No SMTP container**: no code sends mail yet; notifications are deferred
  until the production hosting build-out (SES `ap-southeast-5` is the decided
  direction — see MASTER_PLAN §8).
- **No KMS yet**: the master key lives in `.env.staging` (mode 600) exactly as
  the `KeyProvider` design anticipates; moving to AWS KMS re-wraps one row.
- **No auto-seed**: seeding staging is always an explicit human action.
