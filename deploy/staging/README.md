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
`CLAIMANT_HOST`, proxies `/api/*` to the gateway, and exposes locally-stored
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
3. **DNS**: A records for the two hosts (e.g. `adjuster.staging.…` and
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
# → set ADJUSTER_HOST / CLAIMANT_HOST / *_ORIGIN to the real domains

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

## Local dry-run of this stack

Works on a dev machine without DNS or sudo ports:

```ini
ADJUSTER_HOST=http://adjuster.localhost
CLAIMANT_HOST=http://claim.localhost
ADJUSTER_ORIGIN=http://adjuster.localhost:8088
CLAIMANT_ORIGIN=http://claim.localhost:8088
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
