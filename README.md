# True Claim Insight

Remote claims assessment platform for insurance loss adjusters in Malaysia, powered by AI-driven fraud detection and secure multi-tenant architecture.

## Overview

True Claim Insight digitises the assessment workflow between loss adjusters and claimants. By combining real-time video interaction with multimodal AI risk scoring ("Trinity Engine"), the platform identifies fraud patterns that are invisible to the human eye while streamlining regulatory compliance for the Malaysian insurance market.

### Key Features

- **Trinity AI Engine**: Multimodal fraud detection analyzing voice stress, visual micro-expressions, and behavioral patterns.
- **Remote Video Assessments**: Integrated high-definition video calls via **Daily.co** with real-time risk overlay.
- **Digital Identity (eKYC)**: Secure verification using **Innov8tif/CTOS** and MyKad OCR.
- **BNM Regulatory Compliance**: Automated 7-day SLA tracking, PDPA consent management, and SIU escalation workflows.
- **Advanced RBAC**: 8+ granular roles with strict tenant-level data isolation.
- **B2B Multi-Tenancy**: Support for multiple Insurers and Adjusting Firms with cross-tenant association capabilities.
- **Automated Reporting**: Generation of digital assessment reports with integrated **SigningCloud** signatures.

---

## Technical Stack

| Layer          | Technology                                   |
| -------------- | -------------------------------------------- |
| **Language**   | TypeScript 5.8 (Strict), Python 3.10         |
| **Backend**    | NestJS 11 (Fastify), FastAPI (Risk Analyzer) |
| **Frontend**   | React 18.3, Vite 6, Tailwind CSS, shadcn/ui  |
| **Database**   | PostgreSQL 16 (via Prisma 6 ORM)             |
| **Caching**    | Redis 7.4                                    |
| **Video**      | Daily.co REST API & Web SDK                  |
| **Monorepo**   | Turborepo 2.3 + pnpm 9.15                    |
| **Storage**    | Supabase S3-Compatible Storage               |
| **Deployment** | Docker, Kubernetes (EKS), AWS Malaysia       |

### Storage Buckets (Supabase S3)

The system utilizes specialized storage buckets for different types of data:

- `tci-uploads`: Primary bucket for video session uploads and raw recordings (hardcoded in `video-service`).
- `tci-documents`: Secure storage for claimant documents, IDs, and case-related evidence (configured in `case-service`).
- `tci-recordings`: Storage for final processed and signed session recordings.
- `risk_analysis`: Default bucket for risk engines to store detailed analysis reports and findings.
- `consent_form`: Default bucket for risk engines to store consent forms.

### Third-Party Integrations

- **Daily.co**: WebRTC video infrastructure.
- **Innov8tif / CTOS**: Malaysia-specific eKYC and OCR.
- **Clearspeed**: Voice-based risk analysis.
- **Hume AI / MediaPipe**: Emotional and behavioral micro-expression tracking.
- **SigningCloud**: BNM-compliant digital signatures.

---

## Project Structure

```bash
true-claim-insight/
├── apps/
│   ├── api-gateway/       # NestJS - Central entry point, Auth & Proxy
│   ├── case-service/      # NestJS - Claims lifecycle & BNM workflows
│   ├── video-service/     # NestJS - Daily.co room orchestration
│   ├── risk-engine/       # NestJS - Risk scoring & aggregation logic
│   ├── risk-analyzer/     # Python - AI Multimodal Analysis (Mediapipe/Hume)
│   ├── adjuster-portal/   # React  - Portal for Loss Adjusters & Admins
│   └── claimant-web/      # React  - Mobile-first PWA for Claimants
├── packages/
│   ├── prisma-client/     # Shared database schema & client
│   ├── shared-types/      # Shared TypeScript interfaces & DTOs
│   └── ui-components/     # Shared React components (shadcn/ui)
└── docs/                  # Detailed technical & business documentation
```

---

## Getting Started

### Prerequisites

- **Node.js**: v22.0.0 or higher
- **pnpm**: v9.0.0 or higher
- **Docker Desktop**: v27.0.0 or higher
- **Python**: v3.10 (for `risk-analyzer`)

### One-Step Setup

```bash
pnpm setup
pnpm dev
```

### Fresh Setup

```bash
pnpm setup:reset
pnpm dev
```

---

## Role-Based Access Control (RBAC)

The system enforces strict access control through 8 predefined roles:

| Role                   | Dashboard Access | Key Permissions                              |
| ---------------------- | ---------------- | -------------------------------------------- |
| **Super Admin**        | Full System      | Tenant management, system configuration      |
| **Firm Admin**         | Adjusting Firm   | User management, internal assignments        |
| **Adjuster**           | Field Operations | Video conduction, report drafting, eKYC      |
| **SIU Investigator**   | Fraud/Risk       | Deep-dive analysis, investigation management |
| **Compliance Officer** | Audit/Review     | BNM SLA monitoring, regulatory flags         |
| **Shariah Reviewer**   | Takaful Review   | Shariah compliance auditing                  |
| **Support Desk**       | Service/Help     | Ticket resolution, basic claim view          |
| **Claimant**           | Mobile PWA       | Evidence submission, attending live sessions |

---

## Documentation & Wiki

Detailed guides and specifications are located in the `/docs` directory:

- [System User & Demo Guide](docs/SYSTEM_USER_GUIDE.md) - Demo accounts & walkthroughs.
- [Technical Architecture](docs/ARCHITECTURE.md) - System design & data flow.
- [Business Requirements](docs/REQUIREMENTS.md) - Functional and non-functional specs.
- [Claims Workflow](docs/CLAIMS_WORKFLOW.md) - The 6-stage claim lifecycle.
- [Trinity Engine Deep Dive](docs/TRINITY_EDGE_CASES.md) - How AI scoring works.
- [Malaysia Compliance](docs/MALAYSIA_CLAIMS_COMPLIANCE_REPORT.md) - Regulatory alignment.

---

## Local Access Points (Development)

- **Adjuster Portal**: [http://localhost:4000](http://localhost:4000)
- **Claimant PWA**: [http://localhost:4001](http://localhost:4001)
- **API Swagger Docs**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **Prisma Studio**: `pnpm prisma:studio`

---

## Development Workflow

- **Branching**: Use feature branches (`feat/`, `fix/`).
- **Styles**: Use Tailwind CSS with **shadcn/ui**.
- **Naming**: Use **British English** for all code-level naming (e.g., `colour`, `centre`).
- **Scripts**:
  - `pnpm dev`: Start development servers.
  - `pnpm format`: Prettify entire codebase.
  - `pnpm lint`: Run ESLint checks.
  - `pnpm typecheck`: Run TypeScript compilation check.

---

**Proprietary - True Claim Insight 2026**
