# Staging Sandbox — How TCI Runs on the Shared Server

**Server:** `89.233.105.237` (Singapore) · **Deployed:** 8 September 2026

This is written for someone who does not do DevOps. It explains what is running,
why it was built this way, and the handful of commands you need.

---

## 1. Your addresses

| What | Address |
| --- | --- |
| Adjuster portal | https://tci.smitherytech.com |
| Claimant app | https://tci-claim.smitherytech.com |
| Agent-assisted form | https://tci-agent.smitherytech.com |

All three have real Let's Encrypt certificates, issued automatically.

### How you sign in

**Adjuster portal** — email and password. Every seeded account uses
`DemoPass123!`:

| Role | Email |
| --- | --- |
| Adjuster *(start here)* | `adjuster@pacific.com` |
| Firm admin (adjusting firm) | `admin@pacific.com` |
| Super admin | `superadmin@tci.com` |
| Firm admin (insurer) | `admin@allianz.com` |
| SIU investigator | `siu@allianz.com` |
| Compliance officer | `compliance@allianz.com` |
| Support desk | `support@allianz.com` |
| Shariah reviewer | `shariah@allianz.com` |

**Claimant app** — no password. Enter any Malaysian-format number, e.g.
`+60123456789`, and a six-digit code follows.

**Agent form** — registration number `999999-00` with phone `+60198888888`
(Emily Tan / MSIG in the seed data), then a code. It asks for more than a login
on purpose: this surface skips the code sent to the claimant's own phone, so
the way in must not be something a claimant could type.

Nothing sends those codes — there is no WhatsApp account connected — so the
server returns them directly, and `./deploy.sh --otp` lists the recent ones.
They expire after five minutes, and requests are capped at five per five
minutes per number.

> **The agent hostname is not cosmetic.** The claimant app and the agent form
> are the *same build*; the address it was served from is what decides which
> screens appear. That hostname is compiled into the bundle at build time, so
> changing it means a rebuild, not just a restart. See §7.

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

**Run these on your own machine, from the project root.** You do not need to log
in to the server.

```bash
cd C:\code\true-claim-insight
./deploy.sh
```

That is the whole deployment. It checks your work is pushed, connects to the
server, pulls your code there, rebuilds what changed, updates the database
structure and restarts. 2–5 minutes normally; the very first build took 15.

| Command | What it does |
| --- | --- |
| `./deploy.sh` | Deploy your latest code — the normal one |
| `./deploy.sh --status` | What is running |
| `./deploy.sh --logs` | Watch everything (Ctrl-C to stop) |
| `./deploy.sh --logs case-service` | Watch one service |
| `./deploy.sh --no-build` | Restart without rebuilding — for config changes |
| `./deploy.sh --down` | Stop TCI. **Your data is kept** |
| `./deploy.sh --otp` | Show recent sign-in codes |
| `./deploy.sh --ssh` | Open a shell on the server, if you ever want one |
| `./deploy.sh --help` | The list |

### How long it takes

About **11 minutes** for a full deploy, of which roughly one is compiling. The
other ten are Docker packing and unpacking five service images of 2.3 GB each —
every one carries the whole workspace, `node_modules` included.

It was 25 minutes before two fixes: a build argument given to one image and not
the others split Docker's cache key, so the entire workspace was compiled three
times over; and the pnpm store and turbo cache now survive between builds
instead of starting empty every time. Compiling went from ~400 seconds to ~40.

Trimming those images is the remaining large win — it would take deploys to
three or four minutes — but it risks removing something a service needs at
runtime, so it has not been done blind.

`./deploy.sh --no-build` skips all of it and restarts in seconds. It is the
right command whenever only configuration changed.

`--down` only stops TCI. It cannot touch the ERP — different project name.

### The one thing it will stop you on

The server deploys by pulling **from GitHub**, not from your laptop. So anything
you have not pushed is invisible to it, and you would deploy the previous version
without noticing. `./deploy.sh` therefore checks first and offers to push:

```
! 2 commit(s) are not on GitHub yet:
  The server pulls from GitHub, so it cannot see these.
  Push them now? [Y/n]
```

Say yes. If pushing fails with *permission denied*, your GitHub account has lost
write access to the repository — fix that first; nothing was deployed.

### Two scripts, same name

| | |
| --- | --- |
| `./deploy.sh` in the project root | the remote control you run on your laptop |
| `deploy/staging/deploy.sh` | the real script, which runs on the server |

The second one is where all the safety checks live. The first just calls it over
SSH. You will only ever type the first.

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

## 7. Changing the addresses later

1. Point A-records at `89.233.105.237` for the three names you want.
2. On the server, edit `.env.staging` — nine lines: three `*_HOST`
   (`http://`, because Traefik holds the certificate, not Caddy), three
   `*_ORIGIN` (`https://`, what the browser sees), three `TCI_*_FQDN` (bare
   names, for Traefik's routing).
3. `./deploy.sh`

Traefik fetches the new certificates by itself.

**A full deploy, not `--no-build`.** The agent hostname is compiled into the
claimant bundle — that is what tells the agent surface apart from the claimant
one — so the frontend has to be rebuilt for it to take effect. Everything else
would have been fine with a restart; that one thing is not.

The agent name no longer has to start with `agent.`; `docker-compose.traefik.yml`
passes whatever `TCI_AGENT_FQDN` says into the build. What it must never be is
the *same* name as the claimant host — one build, two surfaces, and the address
is the only thing telling them apart. `deploy.sh` refuses if they match.

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
