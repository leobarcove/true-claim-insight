# True Claim Insight

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
- **TypeScript 5.8.x** everywhere (frontend + backend)
- **Node.js 22.x LTS** runtime
- **pnpm 9.x** package manager

### Frontend
- **React.js 18.3.x** with **Vite 6.x**
- **shadcn/ui** + **Tailwind CSS** for styling
- **Zustand** for state, **TanStack Query** for server state
- **React Hook Form** + **Zod** for forms/validation
- Claimant app is **PWA** (not native mobile)

### Backend
- **NestJS 11.x** with **Fastify 5.x** adapter (3x faster than Express)
- **Prisma 6.x** ORM with **PostgreSQL 16.x**
- **Redis 7.4.x** for caching
- REST APIs with OpenAPI/Swagger docs

### Infrastructure
- **AWS Malaysia** (ap-southeast-5) for data sovereignty
- **Docker 27.x** + **Kubernetes (EKS) 1.31+** for deployment
- **Turborepo 2.3.x** monorepo structure

### Third-Party Integrations
| Provider | Purpose |
|----------|---------|
| Daily.co | Video calls |
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
true-claim-insight/
├── apps/
│   ├── api-gateway/          # NestJS - routing, auth
│   ├── case-service/         # NestJS - claims lifecycle
│   ├── video-service/        # NestJS - Daily.co rooms
│   ├── identity-service/     # NestJS - eKYC
│   ├── risk-engine/          # NestJS - AI scoring
│   ├── document-service/     # NestJS - reports, signing
│   ├── adjuster-portal/      # React - adjuster web app
│   ├── claimant-web/         # React PWA - claimant app
│   └── insurer-dashboard/    # React - insurer portal
├── packages/
│   ├── shared-types/         # TypeScript interfaces (@tci/shared-types)
│   ├── ui-components/        # Shared React components (@tci/ui-components)
│   └── prisma-client/        # Prisma schema + client (@tci/prisma-client)
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
- **Use Fastify adapter** for all services (not Express)

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

## Multi-Tenant Architecture

### Tenant Model
```
Tenant (Organisation)
├── type: ADJUSTING_FIRM | INSURER
├── subscriptionTier: BASIC | PROFESSIONAL | ENTERPRISE
└── settings: JSON (tenant-specific config)

Adjuster (User) → belongs to Tenant
├── Each tenant has multiple adjusters (users)
└── Users within same tenant share access to organisation data
```

### Tenant Isolation Implementation

**Location:** `apps/case-service/src/tenant/`

| Component | File | Purpose |
|-----------|------|---------|
| TenantGuard | `common/guards/tenant.guard.ts` | Validates & injects tenant context |
| TenantService | `tenant/tenant.service.ts` | Tenant filtering utilities |
| @TenantIsolation | `common/decorators/tenant.decorator.ts` | Controller/route decoration |
| @Tenant | `common/decorators/tenant.decorator.ts` | Extract tenant context in handlers |

### Tenant Scopes
- **STRICT**: All queries filtered by tenantId (default for data endpoints)
- **FLEXIBLE**: Tenant filter can be overridden by admins
- **NONE**: No tenant filtering (public/health endpoints)

### Usage Pattern
```typescript
// Controller with tenant isolation
@Controller('claims')
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ClaimsController {
  @Get()
  async findAll(@Tenant() tenantContext: TenantContext) {
    return this.service.findAll(query, tenantContext);
  }
}

// Service with tenant validation
async findOne(id: string, tenantContext?: TenantContext) {
  const claim = await this.prisma.claim.findUnique({ where: { id } });
  if (tenantContext) {
    await this.tenantService.validateClaimAccess(id, tenantContext);
  }
  return claim;
}
```

### Key Rules
- **Never** access data without tenant context in protected routes
- **Always** validate resource ownership before returning data
- Adjusters can only see claims assigned to their organisation
- Cross-tenant access is blocked with `ForbiddenException`

## Documentation References

- **Business requirements:** `docs/REQUIREMENTS.md`
- **Technical architecture:** `docs/ARCHITECTURE.md`
- **Task progress:** `docs/PROGRESS.md`

## Development Commands

```bash
# One-liner setup
pnpm setup

# Or manually:
pnpm install
cp .env.example .env
docker-compose up -d
pnpm prisma:migrate
pnpm prisma:generate

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

## Test Credentials (Local Development)

After running migrations, register a test user or use:

| Role | Email | Password |
|------|-------|----------|
| Adjuster | ahmad@adjustingfirm.com | SecureP@ss123 |

**Note:** You must first register the user via `POST /api/v1/auth/register` or Swagger docs at http://localhost:3000/docs
