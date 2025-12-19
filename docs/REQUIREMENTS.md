# Business Requirements

## Vision

Augmented Adjusting digitises face-to-face interactions between **Loss Adjusters** and **Claimants** through real-time video, AI-powered fraud detection, and streamlined documentation.

## Stakeholders

| Stakeholder | Role | Priority |
|-------------|------|----------|
| Loss Adjuster | Conducts remote assessments (ADJUSTER) | PRIMARY |
| Claimant | Makes insurance claims (CLAIMANT) | PRIMARY |
| Super Admin | Platform administration (SUPER_ADMIN) | ADMIN |
| Insurer Admin | Manages insurer staff/policies (INSURER_ADMIN) | ADMIN |
| Insurer Staff | General claims processing (INSURER_STAFF) | SECONDARY |
| Firm Admin | Manages adjusting firm (FIRM_ADMIN) | ADMIN |
| SIU Investigator | Fraud investigation (SIU_INVESTIGATOR) | REGULATORY |
| Compliance Officer | PDPA/Audit oversight (COMPLIANCE_OFFICER) | REGULATORY |
| Support Desk | Customer support (SUPPORT_DESK) | SUPPORT |
| Shariah Reviewer | Takaful compliance (SHARIAH_REVIEWER) | REGULATORY |

## MVP Scope

**Market:** Malaysia
**Insurance Type:** Motor Insurance
**Claim Types:** Own Damage, Third-Party Property

> 📄 **See also**: [Claims Workflow](./CLAIMS_WORKFLOW.md) for detailed end-to-end scenarios and diagrams.

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
| ADJ-006 | Escalate to SIU (Special Investigation Unit) | P0 |
| ADJ-007 | Track BNM SLA (Acknowledgement within 7 days) | P0 |
| ADJ-008 | Record vehicle Plate/Make/Model for fraud check | P0 |
| ADJ-009 | Verify PDPA consent status | P0 |

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

#### Identity & Onboarding
| ID | Requirement | Priority |
|----|-------------|----------|
| CLM-001 | Registration with phone OTP | P0 |
| CLM-002 | Video eKYC (V-KYC) during assessment | P0 |
| CLM-003 | MyKad OCR via video stream | P0 |
| CLM-004 | Live liveness detection | P0 |

#### Claim Submission (Shared via UI Components)
| ID | Requirement | Priority |
|----|-------------|----------|
| CLM-010 | Select claim type | P0 |
| CLM-011 | Enter vehicle details (Plate/Make/Model) | P0 |
| CLM-012 | Enter incident details & description | P0 |
| CLM-013 | Upload initial damage photos | P0 |
| CLM-014 | Agent-assisted submission support | P0 |
| CLM-015 | AI-aided "Upload & Autocomplete" flow | P1 |

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

### Insurer Dashboard (V2)

| ID | Requirement | Priority | Role |
|----|-------------|----------|------|
| INS-001 | Dashboard overview & KPI tracking | P1 | INSURER_STAFF |
| INS-002 | Manage internal staff and vendor access | P1 | INSURER_ADMIN |
| INS-003 | View and export assessment reports | P1 | INSURER_STAFF |
| INS-004 | Configure organizational compliance settings | P2 | INSURER_ADMIN |

### Regulatory & Compliance (New)
| ID | Requirement | Priority | Role |
|----|-------------|----------|------|
| REG-001 | Cross-claim fraud pattern analysis | P0 | SIU_INVESTIGATOR |
| REG-002 | Data privacy (PDPA) audit logs | P0 | COMPLIANCE_OFFICER |
| REG-003 | Customer grievance resolution | P1 | SUPPORT_DESK |
| REG-004 | Takaful Shariah compliance review | P1 | SHARIAH_REVIEWER |

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

*Version 2.1 | Last Updated: 2025-12-19*
