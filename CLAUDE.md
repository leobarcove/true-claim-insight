# True Claim Insight

Remote claims assessment platform for Loss Adjusters and Claimants in Malaysia's insurance sector.

## Project Context

**What we're building:** A B2B SaaS platform that enables loss adjusters to conduct remote video assessments with claimants, replacing physical site visits. The platform includes AI-powered fraud detection, eKYC verification, and digital signing.

**Primary users:**

- **Loss Adjusters** - Conduct remote video assessments via web portal
- **Claimants** - Submit claims and join video calls via PWA (mobile web)
- **Compliance/SIU** - Fraud detection and regulatory oversight

**Secondary users:**

- **Insurance Admins** - Manage vendors, and assignments
- **Firm Admins** - Manage adjusting firm operations
- **Support Desk** - Handle customer enquiries

**MVP scope:** **Non-motor** claims in Malaysia — travel first (written under the
PA class), then fire, flood and other property lines. Motor code in the repo is
legacy and must not be extended; see "Standing decisions" below and
`docs/MASTER_PLAN.md` §1.

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

- **Turborepo 2.3.x** monorepo structure (actual)
- **Target, not yet built:** AWS Malaysia (ap-southeast-5) for data sovereignty; Docker + Kubernetes (EKS) for deployment. `AWS_REGION` is currently read by no code, and there are no Dockerfiles or manifests — treat data residency as an open commitment, not a property of the system (`docs/MASTER_PLAN.md` §3.4, §4.3 A5)

### Third-Party Integrations

| Provider       | Purpose              | Status |
| -------------- | -------------------- | ------ |
| Daily.co       | Video calls          | **integrated** |
| Hume AI        | Voice/face prosody analysis | **integrated** (risk-analyzer) |
| MediaPipe / Parselmouth | Attention & voice-stress analysis | **integrated** (risk-analyzer) |
| Google Gemini  | Document extraction  | **integrated — offshore; see caveat below** |
| Supabase Storage | Document storage   | **integrated**, with local-filesystem fallback |
| Innov8tif/CTOS | eKYC (OCR, Liveness) | not integrated |
| Clearspeed     | Voice risk analysis  | not integrated |
| Hive AI        | Deepfake detection   | not integrated |
| SigningCloud   | Digital signatures   | not integrated — provider interface exists with a stub |

⚠️ **Data residency caveat.** Gemini, Hume and Daily.co all process claimant
personal data outside Malaysia, and no cross-border transfer basis has been
established. Do not describe the system as keeping data in-country until the
in-country LLM path is real (`docs/MASTER_PLAN.md` §3.4, risk 15).

## Coding Standards

### File Naming

- Use **British English** for file names, folder names, function names
- Use **kebab-case** for files: `case-service.ts`, `video-room.tsx`
- Use **PascalCase** for components: `VideoPlayer.tsx`

### Project Structure

```
**This reflects what actually exists.** Do not add a service to this tree before
it exists — see `docs/MASTER_PLAN.md` §4.3 A8 for why (documenting phantom
services misled an architecture review).

```
true-claim-insight/
├── apps/
│   ├── api-gateway/          # NestJS - edge: auth, proxying; also owns otp/claimants/master-data/users
│   ├── case-service/         # NestJS - claims + cases + policies + documents + signatures + adjusters
│   ├── video-service/        # NestJS - Daily.co rooms, recordings, uploads
│   ├── risk-engine/          # NestJS - Trinity rules, fraud signals, LLM extraction
│   ├── risk-analyzer/        # Python FastAPI - Hume / Parselmouth / MediaPipe analysis
│   ├── adjuster-portal/      # React - adjuster + operator web app
│   └── claimant-web/         # React PWA - claimant app
├── packages/
│   ├── shared-types/         # TypeScript interfaces + intake flow definitions (@tci/shared-types)
│   ├── ui-components/        # Shared React components (@tci/ui-components)
│   └── prisma-client/        # Prisma schema + client (@tci/prisma-client)
├── .github/workflows/        # CI: typecheck + compliance tests
└── docs/
    ├── MASTER_PLAN.md        # Regulatory + build plan — read this first
    ├── MARKET_RESEARCH_TPA_REVENUE.md
    ├── REQUIREMENTS.md       # Business requirements
    ├── ARCHITECTURE.md       # Technical architecture
    └── PROGRESS.md           # Task tracking
```

**Not built (previously documented as if they existed):** `identity-service`
(eKYC), `document-service` (reports/signing — reports are planned for
case-service instead), `insurer-dashboard`, and the `infrastructure/`
terraform + kubernetes tree. There are currently **no Dockerfiles and no
deployment manifests**; local development runs on the host with
`docker-compose` providing Postgres, Redis and Mailhog only.

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
4. **Data sovereignty is a target, not a fact.** Gemini, Hume and Daily.co
   process claimant personal data offshore today and no cross-border basis is
   established — see the caveat above. Do not write code or copy that asserts
   in-country processing until it is true. AWS Malaysia (`ap-southeast-5`) is
   the destination, not the current state.
5. **Multi-tenant isolation** - Adjusting firms and insurers are separate tenants

## Multi-Tenant Architecture

### Tenant Model

```
Tenant (Organisation)
├── type: ADJUSTING_FIRM | INSURER
├── subscriptionTier: BASIC | PROFESSIONAL | ENTERPRISE
└── settings: JSON (tenant-specific config)

User (Identity) → belongs to Tenant
├── Generic model for all roles
└── Linked 1:1 to Adjuster for Loss Adjusters

Adjuster (Professional Profile)
├── Linked to User record
├── Stores license and certifications
└── Does NOT store credentials (uses linked User)
```

### Tenant Isolation Implementation

**Location:** `apps/case-service/src/tenant/`

| Component        | File                                    | Purpose                            |
| ---------------- | --------------------------------------- | ---------------------------------- |
| TenantGuard      | `common/guards/tenant.guard.ts`         | Validates & injects tenant context |
| TenantService    | `tenant/tenant.service.ts`              | Tenant filtering utilities         |
| @TenantIsolation | `common/decorators/tenant.decorator.ts` | Controller/route decoration        |
| @Tenant          | `common/decorators/tenant.decorator.ts` | Extract tenant context in handlers |

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

**Read `docs/MASTER_PLAN.md` first.** It is the source of truth for what this
platform is, what it must comply with, and what is built versus planned:

| Section | Contains |
| --- | --- |
| §1 | Operating model, target claim lines (in/out of scope), the TPA→registered-adjuster trajectory |
| §2 | End-to-end claim journey, and §2.5 the per-claim COGS ceiling the assessment mode enforces |
| §3 | Compliance matrix — every binding BNM/FSA/PDPA requirement → system control → phase, with current PASS/PARTIAL/FAIL verdicts, plus §3.6 false-comfort findings |
| §4 | Domain model, and §4.3 the architecture assessment (blocking defects A1–A3, material A4–A8) |
| §5 | Phased roadmap (Phase 0 → 6) |
| §6 | Risks and **decided positions** — e.g. no portal scraping, AI disclosed not downplayed |
| §8 | **Progress record — what has actually shipped, with commit refs.** Update it whenever work completes |
| §9 | Feasibility: funding, effort estimates, go/no-go gates G1–G11 |

Supporting documents:

- **Market and cost analysis:** `docs/MARKET_RESEARCH_TPA_REVENUE.md` (fee pool, year-1 P&L, the three revenue paths — governs §5 sequencing and §9)
- **System User & Demo Guide:** `docs/SYSTEM_USER_GUIDE.md`
- **Business requirements:** `docs/REQUIREMENTS.md`
- **Technical architecture:** `docs/ARCHITECTURE.md`
- **Task progress:** `docs/PROGRESS.md` (older; the plan's §8 progress record is more current)

### Standing decisions that constrain any change

These are settled. Re-open them explicitly rather than drifting from them.

1. **Target lines are non-motor**, excluding motor, Individual PA and Medical & Health. Travel is in scope because Malaysian travel insurance is written under the PA class. Motor code in the repo is legacy — do not extend it.
2. **TPA now, BNM registration when volume supports two senior adjusters.** Build the regulated machinery early but ship it inert behind `licensedMode`, so registration is a capability flip rather than a rebuild.
3. **Data ownership is declared and enforced.** See `packages/prisma-client/src/data-ownership.ts` and the test that scans for cross-context writes. The exception list may shrink, never grow.
4. **Personal data is encrypted at rest** with the master key behind a `KeyProvider` (`packages/crypto`), so moving to AWS KMS re-wraps one row and touches no data. Only the gateway and case-service hold a key.
5. **Ciphertext and blind indexes never leave the server.** `SENSITIVE_FIELD_OMIT` (in `@tci/prisma-client`) is passed to every `PrismaClient`, so those columns are absent from query results by default; a path that genuinely decrypts opts back in with `omit: { <field>: false }`. Add any new encrypted or hashed personal-data column to that map — `sensitive-fields.spec.ts` reads the Prisma schema and fails if you forget. A `…Last4` tail is what screens display.
6. **Prefer the durable design over the quick fix**, and never leave a partial migration — say so and scope it separately instead.

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

# Build all packages (generates Prisma client)
pnpm build
```

## API Ports (Development)

| Service         | Port | Notes |
| --------------- | ---- | ----- |
| API Gateway     | 3000 | |
| Case Service    | 3001 | |
| Video Service   | 3002 | |
| Risk Engine     | 3004 | |
| Risk Analyzer   | 3005 | Python / FastAPI (uvicorn) |
| Adjuster Portal | 4000 | |
| Claimant Web    | 4001 | |

There is no service on 3003. `identity-service` and `document-service` do not
exist — see the "Not built" note above. Port 3005 belongs to `risk-analyzer`.

## Test Credentials (Local Development)

All seeded users share the same password: `DemoPass123!`

| Role                | Email                    | Tenant                    |
| ------------------- | ------------------------ | ------------------------- |
| SUPER_ADMIN         | superadmin@tci.com       | —                         |
| FIRM_ADMIN          | admin@pacific.com        | Pacific (adjusting firm)  |
| ADJUSTER            | adjuster@pacific.com     | Pacific (adjusting firm)  |
| FIRM_ADMIN          | admin@allianz.com        | Allianz (insurer)         |
| SIU_INVESTIGATOR    | siu@allianz.com          | Allianz                   |
| COMPLIANCE_OFFICER  | compliance@allianz.com   | Allianz                   |
| SUPPORT_DESK        | support@allianz.com      | Allianz                   |
| SHARIAH_REVIEWER    | shariah@allianz.com      | Allianz                   |

Use `adjuster@pacific.com` to log in to the adjuster-portal (http://localhost:4000).

**Source of truth:** `packages/prisma-client/prisma/seed.ts`. To register additional users, use `POST /api/v1/auth/register` or Swagger docs at http://localhost:3000/docs.
