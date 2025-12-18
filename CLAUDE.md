# Augmented Adjusting Platform

Remote claims assessment platform for Loss Adjusters and Claimants in Malaysia's insurance sector.

## Project Context

**What we're building:** A B2B SaaS platform that enables loss adjusters to conduct remote video assessments with claimants, replacing physical site visits. The platform includes AI-powered fraud detection, eKYC verification, and digital signing.

**Primary users:**
- **Loss Adjusters** - Conduct remote video assessments via web portal
- **Claimants** - Submit claims and join video calls via PWA (mobile web)

**Secondary users:**
- Insurance companies - View reports and assign cases (demo quality for MVP)

**MVP scope:** Motor insurance claims (Own Damage, Third-Party Property) in Malaysia

## Tech Stack Rules

### Language & Runtime
- **TypeScript 5.x** everywhere (frontend + backend)
- **Node.js 20 LTS** runtime
- **pnpm 8.x** package manager

### Frontend
- **React.js 18.x** with **Vite 5.x**
- **shadcn/ui** + **Tailwind CSS** for styling
- **Zustand** for state, **TanStack Query** for server state
- **React Hook Form** + **Zod** for forms/validation
- Claimant app is **PWA** (not native mobile)

### Backend
- **NestJS 10.x** for all microservices
- **Prisma 5.x** ORM with **PostgreSQL 15.x**
- **Redis 7.x** for caching
- REST APIs with OpenAPI/Swagger docs

### Infrastructure
- **AWS Malaysia** (ap-southeast-5) for data sovereignty
- **Docker** + **Kubernetes (EKS)** for deployment
- **Turborepo 2.x** monorepo structure

### Third-Party Integrations
| Provider | Purpose |
|----------|---------|
| Tencent TRTC | Video calls |
| Innov8tif/CTOS | eKYC (OCR, Liveness) |
| Clearspeed | Voice risk analysis |
| Hive AI | Deepfake detection |
| MediaPipe | Attention tracking |
| SigningCloud | Digital signatures |

## Coding Standards

### File Naming
- Use **British English** for file names, folder names, function names
- Use **kebab-case** for files: `case-service.ts`, `video-room.tsx`
- Use **PascalCase** for components: `VideoPlayer.tsx`

### Project Structure
```
augmented-adjusting/
├── apps/
│   ├── api-gateway/          # NestJS - routing, auth
│   ├── case-service/         # NestJS - claims lifecycle
│   ├── video-service/        # NestJS - TRTC rooms
│   ├── identity-service/     # NestJS - eKYC
│   ├── risk-engine/          # NestJS - AI scoring
│   ├── document-service/     # NestJS - reports, signing
│   ├── adjuster-portal/      # React - adjuster web app
│   ├── claimant-web/         # React PWA - claimant app
│   └── insurer-dashboard/    # React - insurer portal
├── packages/
│   ├── shared-types/         # TypeScript interfaces
│   ├── ui-components/        # Shared React components
│   └── prisma-client/        # Prisma schema + client
├── infrastructure/
│   ├── terraform/
│   └── kubernetes/
└── docs/
    ├── REQUIREMENTS.md       # Business requirements
    ├── ARCHITECTURE.md       # Technical architecture
    └── PROGRESS.md           # Task tracking
```

### Code Guidelines
- Use strict TypeScript (`strict: true`)
- Prefer composition over inheritance
- Keep functions small and focused
- Write descriptive variable names
- Add JSDoc comments for public APIs

### NestJS Conventions
- One module per domain (claims, adjusters, etc.)
- DTOs with class-validator decorators
- Services contain business logic
- Controllers handle HTTP only

### React Conventions
- Functional components with hooks
- Custom hooks in `/hooks` directory
- Shared components in `packages/ui-components`
- Co-locate tests with components

## Important Rules

1. **Do not run `php artisan migrate` on remote server**
2. **Always perform cleanup for unused files after verification**
3. **Use British English** (colour, behaviour, organisation)
4. **Data sovereignty** - All data must stay in Malaysia region
5. **Multi-tenant isolation** - Adjusting firms and insurers are separate tenants

## Documentation References

- **Business requirements:** `docs/REQUIREMENTS.md`
- **Technical architecture:** `docs/ARCHITECTURE.md`
- **Task progress:** `docs/PROGRESS.md`

## Development Commands

```bash
# Install dependencies
pnpm install

# Start local infrastructure
docker-compose up -d postgres redis localstack

# Run database migrations
pnpm prisma:migrate

# Start all services in dev mode
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

## API Ports (Development)

| Service | Port |
|---------|------|
| API Gateway | 3000 |
| Case Service | 3001 |
| Video Service | 3002 |
| Identity Service | 3003 |
| Risk Engine | 3004 |
| Document Service | 3005 |
| Adjuster Portal | 4000 |
| Claimant Web | 4001 |
