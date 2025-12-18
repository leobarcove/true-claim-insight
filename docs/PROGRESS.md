# Project Progress

**Last Updated:** 2025-12-18
**Status:** Development Phase
**Current Phase:** P2 - Identity & Case Management

---

## Phase Overview

| Phase | Description | Status | Progress |
|-------|-------------|--------|----------|
| P0 | Foundation & Planning | ✅ Complete | 100% |
| P1 | Core Infrastructure | 🟡 In Progress | 50% |
| P2 | Identity & Case Management | 🟡 In Progress | 60% |
| P3 | Video & AI Layer | ⚪ Not Started | 0% |
| P4 | Reporting & Signing | ⚪ Not Started | 0% |
| P5 | MVP Launch | ⚪ Not Started | 0% |

---

## Phase 0: Foundation & Planning

### Documentation
| Task | Status | Notes |
|------|--------|-------|
| Define stakeholders | ✅ | Adjuster + Claimant primary |
| Document requirements | ✅ | docs/REQUIREMENTS.md |
| Technical architecture | ✅ | docs/ARCHITECTURE.md |
| Tech stack decision | ✅ | TypeScript, NestJS, React, AWS |
| Progress tracker | ✅ | This file |

### Regulatory Research
| Task | Status | Notes |
|------|--------|-------|
| BNM Sandbox requirements | ✅ | Standard vs Green Lane |
| Adjuster licensing (BCILLA) | ✅ | MII qualification required |
| PDPA compliance | ⚪ | Pending detailed review |
| Indonesia (OJK) | 🟡 | Basic research done |
| Thailand (OIC) | ⚪ | Pending |
| Philippines (IC) | ⚪ | Pending |

### Third-Party Integrations
| Provider | Documentation | Credentials | Cost Estimate |
|----------|--------------|-------------|---------------|
| Innov8tif/CTOS | ⚪ | ⚪ | ⚪ |
| Tencent TRTC | ⚪ | ⚪ | ⚪ |
| Clearspeed | ⚪ | ⚪ | ⚪ |
| Hive AI | ⚪ | ⚪ | ⚪ |
| SigningCloud | ⚪ | ⚪ | ⚪ |
| MediaPipe | ⚪ | N/A | Free |

### Partnership
| Task | Status | Notes |
|------|--------|-------|
| Identify pilot adjusters (5-10) | ⚪ | Beta testing |
| Identify pilot firm (AMLA) | ⚪ | Partnership target |
| Prepare pitch deck | ⚪ | For outreach |

### Local Development Environment
| Task | Status | Notes |
|------|--------|-------|
| Docker Compose (Postgres, Redis, LocalStack) | ✅ | `docker-compose.yml` |
| Environment variables template | ✅ | `.env.example` |
| Monorepo setup (Turborepo + pnpm) | ✅ | `turbo.json`, `pnpm-workspace.yaml` |
| Root package.json with scripts | ✅ | `pnpm setup` one-liner |
| TypeScript base config | ✅ | `tsconfig.base.json` |
| Shared types package | ✅ | `packages/shared-types` |
| Prisma schema | ✅ | `packages/prisma-client` |
| Folder structure | ✅ | apps/, packages/, infrastructure/ |

---

## Phase 1: Core Infrastructure

### Cloud Setup
| Task | Status |
|------|--------|
| Provision AWS Malaysia region | ⚪ |
| Setup EKS cluster | ⚪ |
| Configure VPC and security | ⚪ |
| Setup PostgreSQL (RDS) | ⚪ |
| Setup Redis (ElastiCache) | ⚪ |
| Setup S3 buckets | ⚪ |
| Setup CI/CD pipeline | ⚪ |

### API Gateway
| Task | Status | Notes |
|------|--------|-------|
| Create NestJS service | ✅ | NestJS 11 + Fastify 5 adapter |
| Implement JWT authentication | ✅ | Access + refresh tokens |
| Auth endpoints (register/login/refresh) | ✅ | With validation DTOs |
| Implement rate limiting | ✅ | @nestjs/throttler |
| Setup audit logging | ✅ | Request/response interceptor |
| Health check endpoints | ✅ | Liveness + readiness probes |
| Swagger documentation | ✅ | Auto-generated OpenAPI |
| Role-based access control | ✅ | RBAC guards |
| Deploy API Gateway | ⚪ | Pending cloud setup |

---

## Phase 2: Identity & Case Management

### Claimant PWA
| Task | Status |
|------|--------|
| Setup React + Vite PWA | ⚪ |
| Phone OTP registration | ⚪ |
| Innov8tif Web SDK integration | ⚪ |
| Liveness detection flow | ⚪ |
| eKYC result screens | ⚪ |
| PWA manifest + service worker | ⚪ |

### Case Service
| Task | Status | Notes |
|------|--------|-------|
| Create NestJS service | ✅ | NestJS 11 + Fastify 5 |
| Claims CRUD endpoints | ✅ | Full CRUD with validation |
| Document upload | ✅ | S3-ready with presigned URLs |
| Adjuster assignment | ✅ | Smart workload-based assignment |
| Case queue endpoints | ✅ | Queue with stats and workload |
| Health check endpoints | ✅ | Liveness + readiness probes |
| Swagger documentation | ✅ | Auto-generated OpenAPI |
| JWT auth guards | ✅ | Role-based access control |

### Adjuster Portal
| Task | Status | Notes |
|------|--------|-------|
| Setup React project | ✅ | Vite 6 + React 18 + TypeScript |
| shadcn/ui components | ✅ | button, card, input, badge, avatar, table, dialog, select, toast |
| TanStack Query integration | ✅ | Hooks for claims API |
| Zustand auth store | ✅ | Persistent auth state |
| React Router setup | ✅ | Protected + public routes |
| API client (axios) | ✅ | Token refresh, interceptors |
| Dashboard page | ✅ | Stats, recent claims, sessions |
| Claims list page | ✅ | Search, filters, status tabs |
| Claim detail page | ✅ | Full claim info, timeline, docs |
| Login page | ✅ | Form validation with Zod |
| Error boundary | ✅ | Graceful error handling |
| Adjuster registration | ⚪ | Backend auth required |
| Scheduling UI | ⚪ | Video service integration |

---

## Phase 3: Video & AI Layer

### Video Service
| Task | Status |
|------|--------|
| Create NestJS service | ⚪ |
| UserSig generation | ⚪ |
| TRTC Web SDK (Adjuster) | ⚪ |
| TRTC Web SDK (Claimant) | ⚪ |
| Room management | ⚪ |
| Recording capture | ⚪ |

### Risk Engine
| Task | Status |
|------|--------|
| Create NestJS service | ⚪ |
| Clearspeed integration | ⚪ |
| Hive AI integration | ⚪ |
| MediaPipe integration | ⚪ |
| Unified risk scoring | ⚪ |
| Explainability layer | ⚪ |

---

## Phase 4: Reporting & Signing

### Document Service
| Task | Status |
|------|--------|
| Create NestJS service | ⚪ |
| Report template (PDF) | ⚪ |
| Auto-generation from call | ⚪ |
| SigningCloud integration | ⚪ |
| Signing webhooks | ⚪ |

---

## Phase 5: MVP Launch

### Quality Assurance
| Task | Status |
|------|--------|
| E2E testing | ⚪ |
| Security audit | ⚪ |
| Performance testing | ⚪ |
| UAT with pilot adjusters | ⚪ |

### Launch
| Task | Status |
|------|--------|
| Documentation / user guides | ⚪ |
| Monitoring setup | ⚪ |
| Pilot onboarding (5-10 adjusters) | ⚪ |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-18 | Adjuster-centric platform | Primary users are adjusters |
| 2025-12-18 | Motor Insurance MVP | Largest volume, clearest use case |
| 2025-12-18 | B2B SaaS model | Adjusters as paying customers |
| 2025-12-18 | TypeScript everywhere | Single language, type safety |
| 2025-12-18 | NestJS for backend | Enterprise-ready, microservices |
| 2025-12-18 | PWA for claimant | Speed to market, web eKYC works |
| 2025-12-18 | AWS Malaysia | Data sovereignty, BNM compliance |
| 2025-12-18 | Turborepo monorepo | Shared types, efficient builds |
| 2025-12-18 | Prisma ORM | Type-safe, great migrations |
| 2025-12-18 | NestJS + Fastify adapter | 3x performance vs Express, keeps TypeScript |
| 2025-12-18 | Project name: True Claim Insight | Professional, clear purpose |
| 2025-12-18 | Latest stable versions | Node 22, NestJS 11, Prisma 6, Vite 6, PostgreSQL 16 |
| 2025-12-18 | shadcn/ui for components | Accessible, customisable, TailwindCSS-based |
| 2025-12-18 | TanStack Query for data fetching | Caching, stale-while-revalidate, devtools |
| 2025-12-18 | Zustand for client state | Minimal, TypeScript-first, persistent storage |
| 2025-12-18 | User model for auth | Generic User model supports all roles (Adjuster, Firm Admin, Claimant, Insurer Staff) |
| 2025-12-18 | API Gateway first | Central auth + routing before connecting frontends |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pilot adjusters not interested | Medium | High | Strong value proposition |
| API integration delays | Medium | Medium | Early vendor engagement |
| Clearspeed accuracy (MY accents) | Medium | High | Calibration testing |
| Video quality on low bandwidth | Medium | Medium | Adaptive bitrate |
| Regulatory compliance gaps | Low | High | Legal review, BNM consult |
| Data breach | Low | Critical | Security audit, encryption |

---

## Next Actions

### This Week
- [x] Setup local development environment
- [x] Create api-gateway service with JWT auth
- [ ] Connect adjuster-portal to api-gateway
- [ ] Obtain API docs from vendors
- [ ] Create cost estimates

### This Month
- [ ] Secure pilot adjuster commitments
- [x] Create first NestJS service (case-service)
- [x] Create api-gateway with full auth flow
- [x] Create first React app (adjuster-portal)
- [ ] Begin Phase 1 cloud infrastructure
- [ ] Create Claimant PWA scaffold
- [ ] Research PDPA requirements

---

## KPIs (Target)

| Metric | Baseline | Target |
|--------|----------|--------|
| Claim Cycle Time | 14-30 days | 3-5 days |
| Adjuster Cases/Day | 3-4 | 6-8 |
| Travel Time/Day | 5+ hours | 1-2 hours |
| Fraud Detection | 2-3% | 5-8% |

---

*Update this document weekly during active development.*
