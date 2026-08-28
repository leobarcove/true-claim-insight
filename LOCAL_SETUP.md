# Local setup

Start Docker Desktop, then from `c:\Code\true-claim-insight`:

```bash
pnpm docker:up
pnpm dev
```

In a second terminal:

```bash
cd apps/risk-analyzer
source venv/Scripts/activate
uvicorn app.main:app --reload --port 3305
```

- Adjuster portal: http://localhost:4300
- Claimant PWA: http://localhost:4301
- API docs: http://localhost:3300/docs

Password for all staff accounts: `DemoPass123!`

| Role | Email |
| --- | --- |
| Adjuster | `adjuster@pacific.com` |
| Super Admin | `superadmin@tci.com` |
| Firm Admin (Pacific) | `admin@pacific.com` |
| Insurer Admin (Allianz) | `admin@allianz.com` |
| SIU Investigator | `siu@allianz.com` |
| Compliance Officer | `compliance@allianz.com` |
