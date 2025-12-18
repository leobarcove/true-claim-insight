# Business Requirements

## Vision

Augmented Adjusting digitises face-to-face interactions between **Loss Adjusters** and **Claimants** through real-time video, AI-powered fraud detection, and streamlined documentation.

## Stakeholders

| Stakeholder | Role | Priority |
|-------------|------|----------|
| Loss Adjuster | Conducts remote assessments | PRIMARY |
| Claimant | Makes insurance claims | PRIMARY |
| Insurance Company | Assigns cases, views reports | SECONDARY |
| Adjusting Firm | Subscribes to platform | SECONDARY |

## MVP Scope

**Market:** Malaysia
**Insurance Type:** Motor Insurance
**Claim Types:** Own Damage, Third-Party Property

---

## Functional Requirements

### Adjuster Portal (Web)

#### Case Management
| ID | Requirement | Priority |
|----|-------------|----------|
| ADJ-001 | View assigned case queue | P0 |
| ADJ-002 | Accept/decline case assignment | P0 |
| ADJ-003 | View case details and documents | P0 |
| ADJ-004 | Schedule video assessment | P0 |
| ADJ-005 | Add case notes | P0 |
| ADJ-006 | Escalate to SIU | P0 |

#### Video Assessment
| ID | Requirement | Priority |
|----|-------------|----------|
| ADJ-010 | Initiate video call | P0 |
| ADJ-011 | HD video with recording | P0 |
| ADJ-012 | Guide claimant walkthrough | P0 |
| ADJ-013 | Capture screenshots | P0 |
| ADJ-014 | View real-time AI risk indicators | P0 |
| ADJ-015 | Trigger voice risk questions | P0 |

#### AI Analysis
| ID | Requirement | Priority |
|----|-------------|----------|
| ADJ-020 | View aggregated risk score | P0 |
| ADJ-021 | View voice analysis breakdown | P0 |
| ADJ-022 | View attention tracking summary | P0 |
| ADJ-023 | Deepfake detection alert | P0 |
| ADJ-024 | Explainability report | P0 |

#### Reporting
| ID | Requirement | Priority |
|----|-------------|----------|
| ADJ-030 | Auto-generate assessment report | P0 |
| ADJ-031 | Edit and finalise report | P0 |
| ADJ-032 | Attach evidence to report | P0 |
| ADJ-033 | Submit with digital signature | P0 |
| ADJ-034 | Export as PDF | P0 |

### Claimant App (PWA)

#### Onboarding
| ID | Requirement | Priority |
|----|-------------|----------|
| CLM-001 | Registration with phone OTP | P0 |
| CLM-002 | eKYC - MyKad OCR scan | P0 |
| CLM-003 | eKYC - Liveness detection | P0 |
| CLM-004 | eKYC - Face match | P0 |

#### Claim Submission
| ID | Requirement | Priority |
|----|-------------|----------|
| CLM-010 | Select claim type | P0 |
| CLM-011 | Enter incident details | P0 |
| CLM-012 | Upload damage photos | P0 |
| CLM-013 | Upload supporting documents | P0 |
| CLM-014 | Select assessment times | P0 |

#### Video Assessment
| ID | Requirement | Priority |
|----|-------------|----------|
| CLM-020 | Receive call notification | P0 |
| CLM-021 | Join video call | P0 |
| CLM-022 | Follow guided walkthrough | P0 |
| CLM-023 | Sign statement digitally | P0 |

#### Tracking
| ID | Requirement | Priority |
|----|-------------|----------|
| CLM-030 | View claim status | P0 |
| CLM-031 | Receive notifications | P0 |
| CLM-032 | View assessment summary | P0 |

### Insurer Dashboard (Demo)

| ID | Requirement | Priority |
|----|-------------|----------|
| INS-001 | Dashboard overview | P1 |
| INS-002 | Assign claims to adjusters | P1 |
| INS-003 | View assessment reports | P1 |
| INS-004 | Export data | P2 |

---

## Regulatory Framework

### Malaysia

| Authority | Relevance |
|-----------|-----------|
| Bank Negara Malaysia (BNM) | Sandbox approval, data protection |
| Malaysian Insurance Institute (MII) | BCILLA certification |
| Association of Malaysian Loss Adjusters (AMLA) | Professional standards |

### Key Regulations

| Regulation | Compliance |
|------------|------------|
| Financial Services Act 2013 | Verify adjuster credentials |
| PDPA 2010 | Consent, encryption, retention |
| Digital Signature Act 1997 | SigningCloud integration |

### BNM Sandbox

| Requirement | Standard Track | Green Lane |
|-------------|----------------|------------|
| Timeline | 3-6 months | 15 days |
| User Cap | Case-by-case | 20,000 max |
| Duration | 12 months | 12 months |

### Adjuster Licensing

Platform must verify:
1. BCILLA certification (MII/AMLA)
2. BNM registration
3. AMLA membership (recommended)

---

## SEA Expansion

| Market | Priority | Regulator | Data Residency |
|--------|----------|-----------|----------------|
| Malaysia | 1 (MVP) | BNM | Preferred local |
| Indonesia | 2 | OJK | Required |
| Thailand | 3 | OIC | Required (financial) |
| Philippines | 4 | IC | Less restrictive |

---

## Business Model

### B2B SaaS Tiers

**Tier 1: Independent Adjuster**
- Single user, 50 cases/month
- RM 299/month

**Tier 2: Adjusting Firm**
- 5-50 seats, unlimited cases
- RM 199/seat/month

**Tier 3: Enterprise**
- Dedicated tenant, API integration
- RM 10,000+/month

### Add-ons
- AI Risk Analysis: RM 5/assessment
- Video Storage: RM 0.50/GB/month
- Additional eKYC: RM 3/verification

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Claim Cycle Time | 14-30 days | 3-5 days |
| Adjuster Cases/Day | 3-4 | 6-8 |
| Travel Time/Day | 5+ hours | 1-2 hours |
| Fraud Detection Rate | 2-3% | 5-8% |
| Claimant Satisfaction | N/A | >4.0/5.0 |

---

## Out of Scope (MVP)

- Life/health/property insurance
- Third-party injury claims
- Multi-party video calls
- Core system API integration
- White-label branding
- Multi-language support

---

*Version 2.0 | Last Updated: 2025-12-18*
