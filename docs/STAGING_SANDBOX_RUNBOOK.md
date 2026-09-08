# Staging Sandbox — How TCI Runs on the Shared Server

**Server:** `89.233.105.237` (Singapore) · **Deployed:** 8 September 2026

This is written for someone who does not do DevOps. It explains what is running,
why it was built this way, and the handful of commands you need.

---

## 1. Your addresses

| What | Address |
| --- | --- |
| Adjuster portal | https://adjuster.89.233.105.237.sslip.io |
| Claimant app | https://claim.89.233.105.237.sslip.io |
| Agent-assisted form | https://agent.89.233.105.237.sslip.io |

Log in to the adjuster portal with `adjuster@pacific.com` / `DemoPass123!`.

**Why the long addresses.** A web address needs a certificate to show the padlock,
and certificates are not issued for bare IP addresses. Without HTTPS the claimant
app cannot be installed as a phone app, video calls cannot reach the camera, and
the Telegram Mini App will not open — so it was not optional.

`sslip.io` is a free public service: any address shaped
`anything.<your-ip>.sslip.io` automatically points at that IP. No signup, no DNS
to manage, and a real Let's Encrypt certificate.

**When you buy a domain**, this becomes three lines in one file plus a restart —
no rebuild. See §7.

> The `agent.` prefix is not decoration. The claimant app reads the hostname to
> decide which screen to show, so that name must keep starting with `agent.`

---

## 2. What is on the server now

The server runs **two completely separate systems**:

```
Server 89.233.105.237
│
├── ERPNext  (fitarch)      ← untouched. 11 days uptime, never restarted
│     MariaDB, Redis, 8 containers
│
└── True Claim Insight      ← new. 9 containers
      PostgreSQL, Redis, 4 Node services, 1 Python service, Caddy
```

TCI's nine containers:

| Container | Job |
| --- | --- |
| `postgres` | The database — every claim, case and message |
| `redis` | Short-term cache |
| `migrate` | Runs once at each deploy to update the database structure, then exits |
| `api-gateway` | Front door for the API — logins, permissions |
| `case-service` | Claims, cases, documents, chat |
| `video-service` | Daily.co video rooms and recordings |
| `risk-engine` | Fraud rules and scoring |
| `risk-analyzer` | Python — voice and face analysis |
| `edge` (Caddy) | Decides which request goes where |

---

## 3. How a request reaches TCI

The single most important thing to understand, because it is why the ERP was
never at risk.

```
Someone's browser
   │  https://claim.89.233.105.237.sslip.io
   ▼
Traefik  ── already on the server, owns ports 80 and 443
   │       reads the address and decides who it belongs to
   ├─────► erp.fitarch.my / the bare IP  →  ERPNext      (unchanged)
   ├─────► ota.fitarch.my                →  expo server  (unchanged)
   └─────► the three tci addresses       →  TCI's Caddy  (new)
                                              │
                                              ├─ /api/...     → api-gateway
                                              ├─ /case-files/ → case-service
                                              └─ everything else → the website
```

**The problem this solves.** Only one program can answer on port 443. Traefik
already did, for the ERP. Installing a second one would have been a fight the
ERP could lose.

**The approach: ask, don't take.** TCI's Caddy stops handling certificates and
stops taking ports. Instead it puts a label on itself saying *"I handle these
three addresses"*. Traefik reads that label automatically and starts forwarding.

**No ERPNext file was edited.** This is not improvisation — the
`expo-update-server` already on your machine works the same way, so the pattern
was proven on this exact server before TCI used it.

---

## 4. What protects the ERP

Four deliberate guards, because a shared server means our mistakes become their
outage.

**No open doors.** TCI publishes **zero** ports to the server. Before and after
deployment, the server listens on exactly the same four: 22, 80, 443, 3306. The
only way into TCI is through Traefik.

> This matters more than it sounds. The server's firewall has a default of
> *allow*, and Docker opens ports underneath the firewall — so any port opened
> would be visible to the whole internet immediately. `deploy.sh` therefore
> re-checks this on **every run** and refuses to start if anything would be
> exposed. It is a gate, not a comment.

**Memory ceilings.** The server has no swap file, which means if memory runs out
the system kills the *largest* program — which would be the ERP's database, not
us. Every TCI container has a hard memory limit. Combined they can never take
more than about 7.5 GB of the 24 GB free. Currently they use under 600 MB.

**Log limits.** Nine containers writing logs forever would eventually fill the
disk, and that disk is shared with the ERP's database. Each container keeps at
most 30 MB of logs. (The normal fix for this needs a Docker restart, which would
have stopped the ERP — so it was done per-container instead.)

**Separate networks.** TCI's database sits on its own private network. Only the
Caddy container touches the shared one.

---

## 5. Commands you will actually use

All from `/opt/true-claim-insight/deploy/staging` on the server.

```bash
ssh -i ~/.ssh/id_rsa_fitarch root@89.233.105.237
cd /opt/true-claim-insight/deploy/staging
```

### Deploy your latest code — the normal one

```bash
./deploy.sh --pull
```

Pulls from GitHub, rebuilds what changed, updates the database structure,
restarts. Takes 2–5 minutes normally; the very first build took 15.

### The rest

| Command | What it does |
| --- | --- |
| `./deploy.sh --status` | What is running |
| `./deploy.sh --logs` | Watch everything (Ctrl-C to stop) |
| `./deploy.sh --logs case-service` | Watch one service |
| `./deploy.sh --no-build` | Restart without rebuilding — for config changes |
| `./deploy.sh --down` | Stop TCI. **Your data is kept** |
| `./deploy.sh` | Start it again |
| `./deploy.sh --help` | The list |

`--down` only stops TCI. It cannot touch the ERP — different project name.

### Logging in as a claimant

There is no WhatsApp account connected, so login codes are not sent anywhere.
They are printed in the logs instead:

```bash
./deploy.sh --logs api-gateway
```

Ask for a code in the app, and it appears in that output.

---

## 6. Your data

Your **local database was copied to the server** — 161 cases, 110 claimants,
4,074 messages, 8 users. Your local copy was only read, never modified, and is
exactly as you left it.

**Where it lives now:** a Docker volume, `tci-staging_postgres_data`. It survives
rebuilds, restarts and `--down`. Uploaded files live in separate volumes.

### The two keys — read this

```
ENCRYPTION_MASTER_KEY
NRIC_INDEX_PEPPER
```

Personal data (names, phone numbers, NRICs) is **encrypted in the database**.
These two keys unlock it. Without them the data is permanently unreadable — not
"difficult to read", genuinely gone.

Because we copied your local database, the server now uses **your local keys**.
They live in `/opt/true-claim-insight/deploy/staging/.env.staging`. Keep a copy
in your password manager.

> Normally each environment gets its own keys. We deliberately broke that rule so
> the copied data could be read, and it is fine here because everything involved
> is synthetic test data. **Do not carry this key to a server holding real
> claimant data.**

### There are no backups

Nothing backs this database up. For test data that is a reasonable trade — but if
you build up work you would miss, ask and a backup job takes ten minutes to add.

---

## 7. Moving to a real domain later

1. Buy a domain, point three A-records at `89.233.105.237`:
   `claim`, `adjuster`, `agent` (that last name must start with `agent`).
2. On the server, edit `.env.staging` and change the nine host lines.
3. `./deploy.sh --no-build`

No rebuild. Traefik fetches the new certificates by itself.

---

## 8. Two problems hit during deployment, and what they mean

Both were the application correctly refusing to run in an unsafe state, not bugs.

**The services would not start at all.** `api-gateway` and `case-service`
crash-looped 17 and 15 times. The reason: the stack was labelled
`NODE_ENV=production`, and in production the code *refuses to start* if there is
no WhatsApp account (login codes would be silently swallowed) and no Supabase
storage (uploaded evidence would be destroyed on the next deploy).

Both guards were right — but this is a sandbox, not production. Relabelling it
`NODE_ENV=staging` takes the intended non-production path: codes go to the log,
files go to disk. **This is set only for this server**; the AWS Malaysia
configuration still says production.

*One consequence:* the login cookie is not flagged "HTTPS-only". Everything here
is HTTPS anyway, so there is no plaintext path — but it is another reason this
setup is for synthetic data.

**Your data would not decrypt.** After copying the database, `case-service`
reported the master key did not match. Correct: the copied data was locked with
your laptop's key, and the server had generated its own. Fixed by copying your
key across — see §6.

---

## 9. Honest limitations

**This is not the planned staging environment.** `MASTER_PLAN.md` §8 records a
decision that staging would be AWS Malaysia (`ap-southeast-5`), chosen so data
residency could be rehearsed. This server is in **Singapore** — still offshore.
It is a sandbox for seeing the system work, not the environment that decision
described. The AWS setup is unaffected and still the target.

**Synthetic data only.** Never put a real NRIC, recording, or bank account here.

**Shared server.** The Caddy container sits on the same network as the ERP's
containers, so they can reach each other. Unavoidable when sharing a machine, and
another reason for the rule above.

**Not connected:** WhatsApp, Supabase, Daily.co video, Gemini, Hume. Each is
inert without credentials — features that need them will not work, but nothing
crashes.

**On reboot:** containers restart automatically, but the four Node services may
briefly crash-loop while waiting for the database. They settle within a minute.
If not: `./deploy.sh --no-build`.

---

## 10. If something breaks

```bash
./deploy.sh --status              # what is running
./deploy.sh --logs <service>      # why it is unhappy
./deploy.sh --no-build            # restart everything
```

`exit 137` in the logs means a container hit its memory ceiling — tell me and the
limit gets raised in `docker-compose.traefik.yml`.

To confirm the ERP is fine (it is separate, but for peace of mind):

```bash
docker ps --filter name=frappe_docker
```

---

## 11. The files, if you ever look

In `deploy/staging/`:

| File | What it is |
| --- | --- |
| `deploy.sh` | The script you run. Every safety check lives here |
| `docker-compose.traefik.yml` | The shared-server adjustments — the only file that knows about the ERP |
| `docker-compose.staging.yml` | The original stack. **Unchanged** — still the AWS artefact |
| `Caddyfile` | Which address goes to which service |
| `.env.staging` | Secrets. Never in git, never leaves the server |

The design point: the shared-server logic is **one separate file**. Deploying to
AWS later means simply not using it.
