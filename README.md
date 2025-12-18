# True Claim Insight

Remote claims assessment platform for insurance loss adjusters in Malaysia.

## Overview

True Claim Insight digitises face-to-face interactions between loss adjusters and claimants through real-time video, AI-powered fraud detection, and streamlined documentation.

**Key Features:**
- Remote video assessments (no travel required)
- AI-assisted fraud detection (voice analysis, deepfake detection)
- Digital identity verification (eKYC)
- Automated report generation
- Digital document signing

**MVP Scope:** Motor insurance claims (Own Damage, Third-Party Property) in Malaysia

---

## Prerequisites

| Software | Version | Install Command (macOS) |
|----------|---------|------------------------|
| **Node.js** | 22.x LTS | `brew install node@22` |
| **pnpm** | 9.x | `corepack enable && corepack prepare pnpm@9 --activate` |
| **Docker Desktop** | 27.x+ | [Download](https://www.docker.com/products/docker-desktop/) |
| **Git** | Latest | `brew install git` |

### Verify Installation

```bash
node -v    # Should show v22.x.x
pnpm -v    # Should show 9.x.x
docker -v  # Should show Docker version 27.x
```

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/true-claim-insight.git
cd true-claim-insight

# One-liner setup (installs deps, starts Docker, runs migrations)
pnpm setup

# Start development servers
pnpm dev
```

### Manual Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create environment file
cp .env.example .env

# 3. Start Docker containers (PostgreSQL, Redis, MailHog)
docker compose up -d

# 4. Wait for containers to be healthy
docker compose ps

# 5. Run database migrations
pnpm prisma:migrate

# 6. Generate Prisma client
pnpm prisma:generate

# 7. Start all services
pnpm dev
```

---

## Access Points

| Application | URL | Description |
|-------------|-----|-------------|
| **API Gateway** | http://localhost:3000 | Authentication, routing |
| **API Gateway Docs** | http://localhost:3000/docs | Swagger for Auth/Users |
| **Case Service** | http://localhost:3001 | Claims management |
| **Case Service Docs** | http://localhost:3001/api/docs | Swagger for Claims |
| **Video Service** | http://localhost:3002 | Video room management (TRTC) |
| **Video Service Docs** | http://localhost:3002/docs | Swagger for Video |
| **Adjuster Portal** | http://localhost:4000 | React web app for adjusters |
| **Claimant PWA** | http://localhost:4001 | React PWA for claimants |
| **MailHog** | http://localhost:8025 | Email testing UI |
| **Prisma Studio** | Run `pnpm prisma:studio` | Database GUI |

---

## Login Credentials (Development)

### Adjuster Portal

| Field | Value |
|-------|-------|
| **Email** | `admin@demo.com` |
| **Password** | `DemoPass123!` |

### Claimant PWA (Phone OTP)

1. Enter any Malaysian phone number (e.g., `123456789`)
2. Check the terminal for the OTP code (logged to console)
3. Enter the 6-digit code to login


---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.8.x |
| Backend | NestJS 11.x + Fastify 5.x |
| Frontend | React 18.3.x + Vite 6.x |
| Database | PostgreSQL 16.x |
| ORM | Prisma 6.x |
| Cache | Redis 7.4.x |
| Cloud | AWS Malaysia (ap-southeast-5) |
| Container | Docker + Kubernetes |
| Monorepo | Turborepo 2.3.x |

### Third-Party Integrations

| Provider | Purpose |
|----------|---------|
| Tencent TRTC | Video calls |
| Innov8tif/CTOS | eKYC (OCR, Liveness) |
| Clearspeed | Voice risk analysis |
| Hive AI | Deepfake detection |
| MediaPipe | Attention tracking |
| SigningCloud | Digital signatures |

---

## Project Structure

```
true-claim-insight/
├── apps/                    # Applications
│   ├── api-gateway/         # API routing & auth
│   ├── case-service/        # Claims management
│   ├── video-service/       # Video calls (TRTC)
│   ├── identity-service/    # eKYC verification
│   ├── risk-engine/         # AI fraud detection
│   ├── document-service/    # Reports & signing
│   ├── adjuster-portal/     # Adjuster web app
│   └── claimant-web/        # Claimant PWA
├── packages/                # Shared code
│   ├── shared-types/        # TypeScript interfaces
│   ├── ui-components/       # React components
│   └── prisma-client/       # Database client
├── infrastructure/          # IaC configs
└── docs/                    # Documentation
```

---

## Scripts

### Development

```bash
pnpm dev              # Start all services in watch mode
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm format           # Format code with Prettier
pnpm typecheck        # TypeScript type checking
```

### Database

```bash
pnpm prisma:migrate   # Run database migrations
pnpm prisma:generate  # Regenerate Prisma client
pnpm prisma:studio    # Open Prisma Studio (DB GUI)
pnpm prisma:seed      # Seed database (when available)
```

### Docker

```bash
pnpm docker:up        # Start Docker services
pnpm docker:down      # Stop Docker services
pnpm docker:logs      # View container logs
pnpm docker:reset     # Reset Docker volumes
```

---

## Troubleshooting

### Port Conflicts

If you have other projects using ports 5432, 6379, or 1025:

```bash
# List running containers
docker ps

# Stop conflicting container
docker stop <container-name>

# Start this project's containers
docker compose up -d
```

### Docker Registry Issues

If Docker fails to pull images, the project uses locally cached images where possible. Check your network/proxy settings if issues persist.

### Database Connection Failed

Ensure PostgreSQL container is healthy:

```bash
docker compose ps
# Wait for "healthy" status, then retry migrations
pnpm prisma:migrate
```

### Node Version Issues

Ensure you're using Node.js 22.x:

```bash
node -v
# If wrong version, use nvm:
nvm install 22
nvm use 22
```

---

## Documentation

- [Business Requirements](docs/REQUIREMENTS.md)
- [Technical Architecture](docs/ARCHITECTURE.md)
- [Progress Tracker](docs/PROGRESS.md)

---

## Contributing

- Use **British English** for file names, folder names, and function names
- Follow existing code patterns and conventions
- Run `pnpm lint` and `pnpm typecheck` before committing
- Do not commit `.env` files or secrets

---

## Licence

Proprietary - All rights reserved
