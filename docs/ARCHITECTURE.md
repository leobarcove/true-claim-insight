# Technical Architecture

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Language | TypeScript | 5.8.x |
| Runtime | Node.js | 22.x LTS |
| Backend | NestJS + Fastify | 11.x + 5.x |
| Frontend | React.js | 18.3.x |
| Build Tool | Vite | 6.x |
| Database | PostgreSQL | 16.x |
| ORM | Prisma | 6.x |
| Cache | Redis | 7.4.x |
| Cloud | AWS Malaysia | ap-southeast-5 |
| Container | Docker | 27.x |
| Orchestration | Kubernetes (EKS) | 1.31+ |
| Monorepo | Turborepo | 2.3.x |
| Package Manager | pnpm | 9.x |

> 📄 **Related Documentation**:
> - [Requirements](./REQUIREMENTS.md) - Business requirements and functional specs
> - [Claims Workflow](./CLAIMS_WORKFLOW.md) - End-to-end claim scenarios and diagrams
> - [Progress](./PROGRESS.md) - Development progress tracker

---

## Architecture Principles

| Principle | Description |
|-----------|-------------|
| Microservices | Decoupled services for each domain |
| API-First | All functionality via REST APIs |
| Async-First | Non-blocking AI/ML processing |
| Security-by-Design | Encryption, audit trails, OAuth 2.0 |
| Cloud-Native | Containerised, Kubernetes-orchestrated |
| Multi-Tenant | Data isolation per firm/insurer |
| Performance-Optimised | Fastify adapter, connection pooling, caching |

---

## Performance Optimisations

### Fastify Adapter (3x faster than Express)

```typescript
// All NestJS services use Fastify adapter
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: true })
);
```

### Optimisation Checklist

| Optimisation | Implementation | Impact |
|--------------|----------------|--------|
| Fastify adapter | Replace Express | 3x throughput |
| Redis caching | Cache frequent queries | 10x read speed |
| Connection pooling | Prisma pool config | Reduced latency |
| Response compression | @fastify/compress | 70% bandwidth |
| Lazy module loading | forwardRef() | Faster startup |
| Cluster mode | PM2 / Node cluster | Utilise all cores |
| Class-validator | whitelist: true | Strip unknown fields |

### Expected Performance

| Metric | Target |
|--------|--------|
| API response time (p95) | < 100ms |
| Throughput per service | 30,000-50,000 req/s |
| Memory per service | < 150MB |
| Cold start time | < 3s |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Claimant PWA     │  Adjuster Portal  │  Insurer Dashboard      │
│  (React + Vite)   │  (React + Vite)   │  (React + Vite)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                               │
│  • OAuth 2.0 / JWT Auth    • Rate Limiting                      │
│  • Request Routing         • Circuit Breaker                    │
└─────────────────────────────────────────────────────────────────┘
                              │
      ┌───────────┬───────────┼───────────┬───────────┐
      ▼           ▼           ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  CASE    │ │  VIDEO   │ │ IDENTITY │ │   RISK   │ │ DOCUMENT │
│ SERVICE  │ │ SERVICE  │ │ SERVICE  │ │  ENGINE  │ │ SERVICE  │
├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤
│ Claims   │ │ TRTC     │ │ eKYC     │ │ Voice AI │ │ Reports  │
│ Queue    │ │ Rooms    │ │ Liveness │ │ Visual   │ │ PDF Gen  │
│ Assign   │ │ Record   │ │ Bureau   │ │ Scoring  │ │ e-Sign   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
      │           │           │           │           │
      └───────────┴───────────┼───────────┴───────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (RDS)  │  Redis (ElastiCache)  │  S3 (Object Store) │
└─────────────────────────────────────────────────────────────────┘
```

---

## Microservices

| Service | Port | Responsibility |
|---------|------|----------------|
| api-gateway | 3000 | Routing, auth, rate limiting |
| case-service | 3001 | Claims lifecycle, assignment |
| video-service | 3002 | TRTC rooms, recordings |
| identity-service | 3003 | eKYC orchestration |
| risk-engine | 3004 | AI scoring, explainability |
| document-service | 3005 | Reports, signing |

---

## External Integrations

| Provider | Purpose | Auth | Timeout |
|----------|---------|------|---------|
| Innov8tif/CTOS | eKYC | AES-256 encrypted | 15s |
| Tencent TRTC | Video calls | HMAC-SHA256 UserSig | N/A |
| Clearspeed | Voice risk | API Key | 30s |
| Hive AI | Visual moderation | API Key | 10s |
| MediaPipe | Attention tracking | Client-side | N/A |
| SigningCloud | Digital signing | OAuth 2.0 | 30s |

---

## Database Schema

### Core Entities

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  password      String
  fullName      String
  role          UserRole
  tenantId      String?
  tenant        Tenant?   @relation(fields: [tenantId], references: [id])
  adjuster      Adjuster?
  siuClaims     Claim[]   @relation("SIUInvestigator")
}

model Tenant {
  id               String    @id @default(uuid())
  name             String
  type             TenantType  // ADJUSTING_FIRM | INSURER
  subscriptionTier SubscriptionTier @default(BASIC)
  adjusters        Adjuster[]
  claims           Claim[]
  users            User[]
}

model Adjuster {
  id              String         @id @default(uuid())
  userId          String         @unique
  tenantId        String
  licenseNumber   String         @unique
  bcillaCertified Boolean        @default(false)
  status          AdjusterStatus @default(ACTIVE)
  user            User           @relation(fields: [userId], references: [id])
  tenant          Tenant         @relation(fields: [tenantId], references: [id])
  claims          Claim[]
}

model Claimant {
  id            String    @id @default(uuid())
  nricHash      String    @unique
  nricEncrypted Bytes
  fullName      String
  phoneNumber   String
  kycStatus     KycStatus @default(PENDING)
  claims        Claim[]
}

model Claim {
  id                      String      @id @default(uuid())
  claimNumber             String      @unique
  claimantId              String
  adjusterId              String?
  insurerTenantId         String?     // FK to Tenant (INSURER)
  siuInvestigatorId       String?     // FK to User (SIU_INVESTIGATOR)
  policyNumber            String
  claimType               ClaimType
  status                  ClaimStatus @default(SUBMITTED)
  incidentDate            DateTime
  description             String
  policeReportNumber      String?
  vehiclePlateNumber      String?
  isPdpaCompliant         Boolean     @default(false)
  slaDeadline             DateTime?
  complianceNotes         Json?       // Storage for audit trail
  claimant                Claimant    @relation(fields: [claimantId])
  adjuster                Adjuster?   @relation(fields: [adjusterId])
  siuInvestigator         User?       @relation("SIUInvestigator", fields: [siuInvestigatorId])
  sessions                Session[]
  documents               Document[]
}

model Session {
  id              String        @id @default(uuid())
  claimId         String
  roomId          BigInt
  status          SessionStatus @default(SCHEDULED)
  startedAt       DateTime?
  endedAt         DateTime?
  recordingUrl    String?
  claim           Claim         @relation(fields: [claimId])
  riskAssessments RiskAssessment[]
}

model RiskAssessment {
  id             String         @id @default(uuid())
  sessionId      String
  assessmentType AssessmentType
  provider       String
  riskScore      RiskScore?
  confidence     Decimal?
  rawResponse    Json?
  session        Session        @relation(fields: [sessionId])
}

model Document {
  id           String       @id @default(uuid())
  claimId      String
  type         DocumentType
  filename     String
  storageUrl   String
  signedAt     DateTime?
  claim        Claim        @relation(fields: [claimId])
}
```

### Enums

```prisma
enum UserRole {
  ADJUSTER
  FIRM_ADMIN
  CLAIMANT
  INSURER_STAFF
  INSURER_ADMIN
  SUPER_ADMIN
  SIU_INVESTIGATOR
  COMPLIANCE_OFFICER
  SUPPORT_DESK
  SHARIAH_REVIEWER
}

enum ClaimType { OWN_DAMAGE, THIRD_PARTY_PROPERTY, THEFT, WINDSCREEN }
enum ClaimStatus { SUBMITTED, ASSIGNED, SCHEDULED, IN_ASSESSMENT, REPORT_PENDING, APPROVED, REJECTED, ESCALATED_SIU, CLOSED }
enum SessionStatus { SCHEDULED, WAITING, IN_PROGRESS, COMPLETED, CANCELLED }
enum AssessmentType { VOICE_ANALYSIS, VISUAL_MODERATION, ATTENTION_TRACKING, DEEPFAKE_CHECK }
enum RiskScore { LOW, MEDIUM, HIGH }
enum DocumentType { DAMAGE_PHOTO, POLICE_REPORT, ASSESSMENT_REPORT, SIGNED_STATEMENT }
```

---

## Security Architecture

### Authentication

| User Type | Method | Session |
|-----------|--------|---------|
| Claimant | Phone OTP + eKYC | JWT 1h / Refresh 7d |
| Adjuster | Email + Password + 2FA | JWT 8h / Refresh 30d |
| Admin | SSO + 2FA | JWT 4h |

### Encryption

| Data Type | At Rest | In Transit |
|-----------|---------|------------|
| NRIC | AES-256-GCM | TLS 1.3 |
| Biometrics | AES-256-GCM | TLS 1.3 |
| Video | AES-256-GCM | TLS 1.3 (SRTP) |
| Database | AWS KMS | TLS 1.3 |

### Authorisation (RBAC)

```yaml
CLAIMANT: [view_own_claims, submit_claims, join_video, sign_documents]
ADJUSTER: [view_assigned_claims, conduct_assessments, generate_reports]
FIRM_ADMIN: [manage_adjusters, view_firm_claims, billing]
INSURER_ADMIN: [assign_claims, view_reports, manage_staff, export_data]
INSURER_STAFF: [view_unit_claims, process_approvals, view_reports]
SUPER_ADMIN: [manage_tenants, view_system_logs, manage_admins, full_access]
SIU_INVESTIGATOR: [view_all_claims, escalate_fraud, cross_case_analysis]
COMPLIANCE_OFFICER: [audit_logs, pdpa_review, sla_monitoring]
SUPPORT_DESK: [view_status, answer_enquiries, update_notes]
SHARIAH_REVIEWER: [view_settlements, verify_takaful_compliance]
```

---

## Infrastructure

### AWS Services

| Service | Purpose |
|---------|---------|
| EKS | Kubernetes cluster |
| RDS | PostgreSQL (Multi-AZ) |
| ElastiCache | Redis cluster |
| S3 | Documents, recordings |
| Secrets Manager | API keys, credentials |
| CloudWatch | Logging, monitoring |
| ALB | Load balancer |

### Kubernetes Structure

```
infrastructure/kubernetes/
├── base/
│   ├── namespace.yaml
│   └── configmap.yaml
├── services/
│   ├── api-gateway/
│   ├── case-service/
│   ├── video-service/
│   ├── identity-service/
│   ├── risk-engine/
│   └── document-service/
└── ingress/
```

---

## Development Setup

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: augadj
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: augmented_adjusting
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  localstack:
    image: localstack/localstack
    environment:
      SERVICES: s3,secretsmanager
      DEFAULT_REGION: ap-southeast-5
    ports: ["4566:4566"]
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://augadj:localdev@localhost:5432/augmented_adjusting

# Redis
REDIS_URL=redis://localhost:6379

# AWS (LocalStack)
AWS_REGION=ap-southeast-5
AWS_ENDPOINT=http://localhost:4566

# Third-Party (obtain from vendors)
TRTC_SDK_APP_ID=
TRTC_SECRET_KEY=
INNOV8TIF_API_KEY=
CLEARSPEED_API_KEY=
HIVE_API_KEY=
SIGNINGCLOUD_CLIENT_ID=
SIGNINGCLOUD_CLIENT_SECRET=

# JWT
JWT_SECRET=local-dev-secret
JWT_ACCESS_EXPIRY=3600
```

---

## CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
jobs:
  lint:
    - pnpm install
    - pnpm lint

  test:
    - pnpm install
    - pnpm test

  build:
    needs: [lint, test]
    - pnpm build

  docker:
    needs: [build]
    if: github.ref == 'refs/heads/main'
    - docker build & push to GHCR
```

---

## API Contracts

### POST /api/v1/claims

```json
// Request
{
  "policyNumber": "POL-2025-001234",
  "claimType": "OWN_DAMAGE",
  "incidentDate": "2025-12-15",
  "incidentLocation": { "address": "...", "latitude": 3.15, "longitude": 101.71 },
  "description": "Rear-ended at traffic light"
}

// Response (201)
{
  "claimId": "CLM-2025-000789",
  "status": "SUBMITTED",
  "nextSteps": ["Upload photos", "Wait for assignment"]
}
```

### GET /api/v1/risk/assessment/{claimId}

```json
// Response
{
  "overallRisk": "LOW",
  "confidence": 0.87,
  "breakdown": {
    "voiceAnalysis": { "score": "LOW", "confidence": 0.89 },
    "visualAnalysis": { "deepfakeDetected": false },
    "attentionTracking": { "averageScore": 0.92 }
  },
  "explainability": {
    "summary": "No significant risk indicators detected",
    "factors": [...]
  }
}
```

---

## TRTC Firewall Rules

```yaml
outbound:
  - TCP 443 → trtc.tencentcloudapi.com
  - UDP 8000, 8080, 8800, 843, 16285 → 0.0.0.0/0
```

---

## Error Handling

```yaml
circuit_breaker:
  threshold: 5 failures in 60s
  recovery: 30s
  fallback:
    ekyc: Queue for manual verification
    voice_analysis: Proceed without score (flag for review)
    signing: Retry queue with notification
```

---

*Version 2.0 | Last Updated: 2025-12-18*
