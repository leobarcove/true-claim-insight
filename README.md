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

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.8.x |
| Backend | NestJS 11.x + Fastify 5.x |
| Frontend | React 18.3.x + Vite 6.x |
| Database | PostgreSQL 16.x |
| ORM | Prisma 6.x |
| Cache | Redis 7.4.x |
| Cloud | AWS Malaysia |
| Container | Docker + Kubernetes |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker 27+

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/true-claim-insight.git
cd true-claim-insight

# One-liner setup (installs deps, starts Docker, runs migrations)
pnpm setup

# Or manually:
pnpm install
cp .env.example .env
docker-compose up -d
pnpm prisma:migrate
pnpm prisma:generate

# Start development servers
pnpm dev
```

### Access Points

| Application | URL |
|-------------|-----|
| API Gateway | http://localhost:3000 |
| API Docs | http://localhost:3000/api/docs |
| Adjuster Portal | http://localhost:4000 |
| Claimant Web | http://localhost:4001 |
| Prisma Studio | http://localhost:5555 |
| MailHog (email) | http://localhost:8025 |

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

## Documentation

- [Business Requirements](docs/REQUIREMENTS.md)
- [Technical Architecture](docs/ARCHITECTURE.md)
- [Progress Tracker](docs/PROGRESS.md)

## Scripts

```bash
pnpm setup        # One-liner setup
pnpm dev          # Start all services
pnpm build        # Build all packages
pnpm test         # Run tests
pnpm lint         # Lint code
pnpm format       # Format code
pnpm typecheck    # TypeScript check
pnpm prisma:migrate  # Run DB migrations
pnpm prisma:studio   # Open Prisma Studio
pnpm docker:up       # Start Docker services
pnpm docker:down     # Stop Docker services
pnpm docker:reset    # Reset Docker volumes
```

## Licence

Proprietary - All rights reserved
