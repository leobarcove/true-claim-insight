# Augmented Adjusting

Remote claims assessment platform for insurance loss adjusters in Malaysia.

## Overview

Augmented Adjusting digitises face-to-face interactions between loss adjusters and claimants through real-time video, AI-powered fraud detection, and streamlined documentation.

**Key Features:**
- Remote video assessments (no travel required)
- AI-assisted fraud detection (voice analysis, deepfake detection)
- Digital identity verification (eKYC)
- Automated report generation
- Digital document signing

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.x |
| Backend | NestJS 10.x |
| Frontend | React 18.x + Vite |
| Database | PostgreSQL 15.x |
| Cache | Redis 7.x |
| Cloud | AWS Malaysia |
| Container | Docker + Kubernetes |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker 24+

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/augmented-adjusting.git
cd augmented-adjusting

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.development

# Start infrastructure
docker-compose up -d postgres redis localstack

# Run database migrations
pnpm prisma:migrate

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

## Project Structure

```
augmented-adjusting/
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
pnpm dev          # Start all services
pnpm build        # Build all packages
pnpm test         # Run tests
pnpm lint         # Lint code
pnpm prisma:migrate  # Run DB migrations
pnpm prisma:studio   # Open Prisma Studio
```

## Licence

Proprietary - All rights reserved
