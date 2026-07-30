# MASTER PLAN — True Claim Insight as the Operating System of a Malaysian Non-Motor Loss Adjusting Firm

## Context

The operator runs an unlicensed TPA (claims administration for insurers; MSIG verbally agreed as first client, white-label, multi-panel ambition) and intends to become a **BNM-registered adjuster** under the Financial Services Act 2013. The user supplied the two governing documents — the FSA 2013 and BNM's *Registration Procedures and Requirements on Professionalism of Adjusters* (BNM/RH/PD 032-29, 29 Aug 2025) — and asked for a master plan that makes the system embody the required SOPs, grounded in Malaysian market practice, focused on **non-motor claims**, with the complete claimant→agent/insurer→adjusting-firm user flow made explicit. Compliance is non-negotiable: every binding requirement must map to an enforced system control.

This plan was produced from: (1) a full codebase audit, (2) paragraph-level extraction of both regulatory documents, (3) the BNM Claims Settlement Practices PD (CSP, BNM/RH/PD 029-69) timeline anchors, and (4) market research on Malaysian adjusting practice (AMLA, appointment channels, report conventions). A separate per-requirement compliance verification audit produced the verdict column in §3.

**Regulatory posture in one line:** adjusting is a *registered business* (FSA Sch 1 Pt 2 item 10) — registration arises by operation of law once the Order's requirements are met; BNM standards under s.18(2) are binding and monetary-penalty-exposed (Sch 15); adjusters are "financial service providers" caught by conduct rules (s.123/124 + Sch 7); BNM can examine without notice (s.146). The system is therefore the firm's compliance evidence.

---

## 1. Vision & operating model

**The licence flag concept** — TPA→adjuster transition is a capability flip, not a rebuild:

| Mode | What the firm does | What the system enforces |
|---|---|---|
| `TPA` (today) | Claims administration on behalf of insurer; no independent adjusting opinion | Full workflow; outputs labelled "assessment summaries"; soft gates |
| `REGISTERED_ADJUSTER` | Independent appointed adjusting; issues adjuster's reports | Same workflow + hard gates: qualified-assignee-only, junior supervision + senior countersign, mandatory COI screen, BNM change notifications, CPD floor |
| Marine/aviation (optional) | Exempt from registration (FSA s.17(2)(b)) | Unregulated line, same rigour, no registration gates. Not in scope until demanded |

**White-label multi-panel:** each insurer is a `Tenant` (type INSURER) with its own branding, fee scales, SLA thresholds and assessment-mode routing — hung off the currently-unused `Tenant.settings`, promoted to a structured per-tenant config surface. The firm is one ADJUSTING_FIRM tenant.

**Product thesis:** non-motor adjusting is document-heavy, timeline-bound (CSP), and dominated by small-to-mid claims where a site visit is economically irrational. The wedge is the **assessment-mode router** — DESK_REVIEW / REMOTE_VIDEO / SITE_VISIT / EXPERT_REFERRAL selected per category + amount + fraud flags, thresholds per insurer tenant. Fast-track desk review of small claims is the core product; the existing video/AI stack is the differentiator for the middle band.

---

## 2. The claim journey blueprint (the system's spine)

### 2.1 End-to-end flow — external (Malaysian practice)

```
Claimant/Insured      Agent/Broker      Insurer (ITO)             Adjusting firm ops        Adjusting employee       Senior adjuster    Compliance      Finance
1. Loss occurs
2. Notify ──────────► relays FNOL ────► 3. Registers FNOL,
   (or direct branch/                      coverage check,
   hotline/portal; or                      acknowledges (CSP)
   our white-label                      4. Routes: in-house desk
   intake in TPA mode)                     OR appoints adjuster ──► 5. Appointment received
                                           (email/portal/Merimen)     (email/Merimen/API)
                                                                   6. Ack to ITO ≤1 wkg day
                                                                   7. COI screen ──────────────────────────────────────────────► clears/blocks
                                                                   8. Assign (competency,
                                                                      seniority, rotation) ──► 9. Contact claimant,
                                                                                                  request documents
10. Supplies docs ◄────────────────────────────────────────────────────────────────────────────   (checklist-driven)
                                                                                               11. Assessment-mode route:
                                                                                                   desk/video/site/expert
                                                                                               12. Inspect + investigate
                                                                                               13. Preliminary report ──► review ──► to ITO (~7–14 days)
                                                                                               14. Interim reports if protracted
                                                                                               15. Adjust quantum (coverage,
                                                                                                   average, betterment,
                                                                                                   depreciation, excess)
                                                                                               16. Final report draft ──► senior countersign ──► 17. Final report to ITO
                                                                                                   (≤10 wkg days from complete docs, CSP)
                                        18. ITO decides ≤7 wkg days
                                        19. Offer + discharge voucher
20. Accepts/signs ◄─────────────────────
                                        21. Payment ≤14 wkg days (non-motor)
                                                                                                                                              22. Fee note to ITO
                                                                                                                                              23. Fee settlement (CSP 11.16–11.18)
```

Supplementary claims: 5 working days (CSP). Steps 6, 13, 17 are firm-side SLA clocks; steps 3, 18, 21 are insurer-side clocks the firm monitors for MI/escalation.

### 2.2 Step → module map (existing vs planned)

| # | Step | Existing (build on) | Planned (fills gap) |
|---|---|---|---|
| 1–2 | FNOL via agent / insurer / broker / white-label | **Cases** intake: transition table, channels, policy matching, bank details | WhatsApp channel (Ph 5); AGENT/BROKER/INSURER_FORWARDED channel tags so all four channels land in one Case funnel |
| 3–4 | ITO registers, routes | Out of scope (insurer's system) | Insurer decision capture on `Assignment` |
| 5 | Appointment received | Nothing — claims only appear via `Case.convert()` | **`Assignment`** entity (Ph 2); Merimen/email ingestion (Ph 5) |
| 6 | Ack ≤1 working day | Nothing | **SLA engine** clock + ack template (Ph 1) |
| 7 | COI screen | Nothing | **`ConflictDeclaration`** gate pre-assignment (Ph 3) |
| 8 | Qualified assignment | `Adjuster` model exists, professional fields dead; manual assignment, capacity hardcoded 10 | **Assignment engine**: competency, seniority, rotation, capacity config (Ph 3) |
| 9–10 | Document collection | `EvidenceRequirement` checklists; documents + storage + AI extraction | Fix travel-checklist bug (claims.service.ts:534); non-motor checklist sets; document-request notifications + reminder clocks (Ph 1–2) |
| 11 | Assessment-mode routing | Concept agreed; enum exists | **Router**: per-tenant thresholds → 4 modes (Ph 2) |
| 12 | Inspect/investigate | Daily.co video (real); risk-analyzer Hume/MediaPipe (real); FraudSignal orchestrator + MetMalaysia provider (stub data) | Site-visit mode: mobile checklist, geotagged photos, offline tolerance (Ph 4); scope-of-loss/inventory capture (Ph 4) |
| 13–17 | Reports | **Nothing** — REPORT_PENDING is an empty label; 809-line pdfkit generator reusable as infra | **`AdjusterReport`** engine: sections, versions, junior→senior review, sign-off, PDF (Ph 1). Preliminary/interim/final/supplementary |
| 15 | Quantum | Nothing for non-motor | Quantum worksheet: sum insured vs value-at-risk, average, betterment, depreciation, excess → report lines (Ph 2) |
| 16 | Senior countersign | Nothing (PD 12.3/12.4/12.7(b)) | Mandatory senior sign-off workflow (Ph 1), data-driven enforcement from seniority (Ph 3) |
| 19–20 | Discharge voucher signing | SignaturesModule state machine real; provider stubbed | Real provider (SigningCloud) (Ph 4) |
| 22–23 | Fees | **Nothing** — zero billing code | **Billing**: FeeScale, FeeNote, TimeEntry, Disbursement, SST, statements (Ph 2) |
| All | Deadlines | `slaDeadline`/`priority` dead columns; **no scheduler/queue in repo** | **SLA engine** + durable queue (BullMQ on existing Redis) (Ph 1) |
| All | Comms | OTP = console.log; nothing else | **Notifications**: templates EN/BM, email first, delivery log (Ph 1) |
| All | Audit | AuditTrail model exists; interceptor TODO; most modules write zero rows | Evidential audit: before/after values, append-only, full coverage (Ph 1) |

### 2.3 Two operating modes on one spine

| | TPA-administered (today) | Insurer-appointed adjusting (target) |
|---|---|---|
| Entry | Case (white-label intake) → convert() → Claim | Assignment received → Claim opened directly (Case optional) |
| Firm's role | Administers; insurer decides | Independent assessment; firm recommends, ITO decides |
| Output | Assessment summary / recommendation pack | Adjuster's report (preliminary→final), senior-signed |
| Gates | Soft (workflow guidance) | Hard (COI, competency, countersign, BNM notifications) |
| Fees | Per-tenant TPA fee schedule | Adjuster fee scale + disbursements, fee note to ITO |

Shared by both: evidence checklists, assessment-mode router, fraud signals, video, documents, SLA clocks, notifications, audit. `licensedMode` flag + `Assignment.mode` select the gate set.

### 2.4 Small-claims fast-track branch

```
IF category ∈ tenant.fastTrackCategories
AND estimatedAmount ≤ tenant.fastTrackLimit[category]
AND no open FraudSignal ≥ MEDIUM
AND evidence checklist complete
→ mode = DESK_REVIEW, fast-track SLA profile (e.g. final report 3 wkg days),
  single-adjuster handling, short-form report template
ELSE escalate one level (video → site → expert) on any trigger:
  fraud flag mid-flight, amount revised upward, AI-extraction inconsistency
```

Mode changes are audited and disclosed in the report (PD 12.6 methodology disclosure).

---

## 3. Compliance matrix (with current-state verdicts)

Verdicts from the formal per-requirement codebase audit (verified by spot-check): **PASS** (implemented + enforced server-side) / **PARTIAL** (exists but unenforced/incomplete) / **FAIL** (absent). **Result: 0 PASS, 7 PARTIAL, 20 FAIL.** The more serious finding is *false comfort*: schema columns, UI badges and docs assert compliance states no code produces (see §3.6). Each row should eventually link to a demonstrable screen or record.

### 3.1 BNM Adjuster PD (binding "S" paragraphs)

| Ref | Requirement | Current | Target control | Phase |
|---|---|---|---|---|
| 8.1/13.1 | Registration lifecycle; notify BNM ≤7 wkg days of capital/office/director/CEO/shareholder changes | **FAIL** — no directors/shareholders/capital entity, no notification tracking | `BnmNotification` register with own SLA clock (licensed mode) | 5 |
| 10.1/10.2 | Fit & proper records for shareholders/KRPs | **FAIL** — no entity | Fit-and-proper attestation records + periodic re-attestation in compliance module | 3 |
| 10.3, 12.1(d) | COI: staff/family ties to insurers/workshops; per-claim screening | **FAIL** — `assignAdjuster` performs no screening | `ConflictDeclaration` standing + per-assignment attestation; blocking gate | 3 |
| 11.2(a) | End-to-end adjusting process embodied until report completion | **PARTIAL** — chain exists intake→assign→docs→session, terminates before any report | The claim-journey spine itself (§2) + report engine | 1–2 |
| 11.2(b) | Rotation of assignments + work-quality reviews | **FAIL** — workload scoring exists but advisory and orphaned | Rotation counters; QA review sampling on reports | 3 |
| 11.2(d) | Escalation processes to Board | **FAIL** | `ComplianceEvent` register → Board-report export | 3 |
| 11.2(e) | Pre-employment background screening | **FAIL** | Screening checklist + document slots on adjuster onboarding | 3 |
| 12.1(a),(b), 12.2(a) | Adjusting work only by full-time qualified adjusting employees | **PARTIAL** — credential columns exist but inert (`licenseVerifiedAt` zero reads/writes; no HTTP path can update licence; no employment-type field) | Employment-type + qualification fields live; assignment engine refuses unqualified in licensed mode | 3 |
| 12.2(b) | Assignment commensurate with skills/qualifications/experience | **PARTIAL** — assignment checks only tenant + existence; SUSPENDED adjuster is assignable | `AdjusterCompetency` (category × level × yearsInSubject) matching | 3 |
| 12.3/12.4 | Junior (<5 yrs subject) supervised ≥1 yr; senior recognition criteria | **FAIL** — no seniority model | Seniority derivation; supervised-status on assignments | 3 |
| 12.5 | Turnaround per internal policy honouring CSP | **PARTIAL** (vestigial) — `slaDeadline` one passthrough write, zero reads; **no scheduler in the entire monorepo** | `SlaPolicy` + `SlaClock` per stage; breach escalation | 1 |
| 12.6 | Report discloses facts, assumptions, methods, sources, databases | **PARTIAL** — only artefact is the Trinity fraud PDF (machine analysis, no assumptions/scope/sources, no author) | `AdjusterReport` mandatory Methodology/Sources/Assumptions sections; AI-derived content flagged | 1 |
| 12.7 | Reports authored by adjusting employees only; junior reports senior-signed | **FAIL** — zero matches for any review/sign-off concept; report PDF carries no adjuster name | Author restricted to adjusting employees; hard senior-countersign gate | 1 (workflow) / 3 (data-driven) |
| 12.8 | Records ≥7 years incl. photos, police/bomba reports, statements | **FAIL** — documents hard-deleted (with "soft delete in production" comment); StorageService has **no delete method** so files orphan; no retention anywhere | `RetentionPolicy` engine (7-yr floor, legal hold); soft-delete everywhere; storage lifecycle | 2 |
| 12.9–12.11 | Training; CPD 15 hrs/yr; AMLA-referenced programmes | **FAIL** | `CpdRecord` ledger + annual floor dashboard | 3 |

### 3.2 CSP timeline anchors (binding on adjusters)

| Anchor | Current | Target control | Phase |
|---|---|---|---|
| Firm ack of appointment ≤1 wkg day | **FAIL** — no appointment entity, no ack timestamp, no working-day arithmetic anywhere | `SlaClock` ACK_TO_ITO + auto-ack template | 1 |
| Preliminary report ~7–14 days (market practice) | **FAIL** | `SlaClock` PRELIM_REPORT (per-tenant target) | 1 |
| Final report ≤10 wkg days from complete documents | **FAIL** — checklist computed but emits no completeness event; gates nothing | `SlaClock` FINAL_REPORT starting at checklist-complete event (`documentsCompleteAt`) | 1 |
| Supplementary claims 5 wkg days | **FAIL** — structurally precluded: CLOSED is terminal, `convertedClaimId @unique` blocks reopen | `SlaClock` SUPPLEMENTARY + reopen path | 2 |
| ITO decision ≤7 days / payment ≤14 days (monitor) | **FAIL** | Insurer-side clocks, MI only | 2 |
| Fee settlement by ITO (CSP 11.16–11.18) | **FAIL** — zero billing code | `FeeNote` ageing + per-insurer statements | 2 |
| Records readily available (audit-readiness) | **PARTIAL** — 5 write sites all in case-service; `oldValues/newValues` written by zero code; global interceptor is a TODO; no immutability; cases module writes zero rows | Evidential audit trail (Ph 1) | 1 |

Working-day arithmetic requires a Malaysian holiday calendar (national + state) — part of the SLA engine (Ph 1).

### 3.3 FSA 2013 constraints

| Ref | Constraint | Current | Target control | Phase |
|---|---|---|---|---|
| s.123/124 + Sch 7 | No misleading/deceptive claimant-facing statements incl. AI outputs | **FAIL** — no content governance; and `GET /claims/:id` returns deception scores/risk data to claimants (redaction misses `sessions[].summary`, `deceptionData`, `fraudSignals`) | Versioned, compliance-approved templates; LLM output never verbatim to claimants; redaction fix in Phase 0 | 0/1 (flag) / 5 (formal approval) |
| s.143 | Produce documents/information to BNM in specified form | **FAIL** — no export/bundle capability of any kind | Claim-file export bundle (docs + audit + reports) | 2 |
| s.146 | No-notice examination — audit-ready always | **FAIL** — see audit-trail row above | Append-only evidential audit trail + this matrix as live dashboard | 1 |
| s.139 | "Insurance" naming restriction | **PARTIAL** — brand clean, but claimant-web title/PWA manifest say "Insurance Claims Made Easy"; refer to counsel | Policy note + legal review of taglines | 0 |
| s.240 | Director personal liability | — | Motivates ComplianceEvent/Board register | 3 |

### 3.4 PDPA 2010 + AMLA

| Requirement | Current | Target control | Phase |
|---|---|---|---|
| Consent (lawful basis, withdrawal) | **FAIL** — `isPdpaCompliant` hardcoded `true` by frontends, gates nothing; biometric-consent PDF generated *after* recording is analysed; withdrawal impossible | `Consent` entity at intake + claim registration; purpose-bound; captured *before* processing; replaces hardcoded flag | 1 |
| NRIC/bank-detail protection | **FAIL** — plaintext NRIC live + indexed; `nricHash`/`nricEncrypted` writers have zero callers; NRIC written to application logs; `verify-nric` endpoint lacks JwtAuthGuard; cases module returns full bank details with no role gating or redaction | Field-level encryption; masking extended to Cases; endpoint/role hotfixes in Phase 0 | 0/1 |
| Retention/deletion | **FAIL** — no deletion/anonymisation mechanism exists; cases can never be deleted; claim documents hard-deleted while storage objects orphan | `RetentionPolicy` (7-yr floor per PD 12.8, scheduled deletion/anonymisation; legal hold) | 2 |
| Cross-border transfer (Gemini/Hume/Daily.co/Supabase/Nominatim) | **FAIL** — five live offshore recipients, none gated; Gemini is the live default for MyKad/police-report images; the "sovereign" Ollama path points at an ephemeral Cloudflare tunnel | Local LLM default for PII docs (real infrastructure, not tunnel); per-tenant provider policy; transfer register | 2 |
| AMLA/CTF screening | **FAIL** — no screening/CDD/STR concepts; `KycStatus` writer has zero callers, nothing gates on it | Sanctions/PEP screening plugin at claimant/payee registration; suspicious-matter → ComplianceEvent | 5 |

### 3.6 False-comfort findings (fix the assertions, not just the gaps)

The audit's most dangerous items are places where the system *claims* a control that does not run. These are corrected in Phase 0/1 by either implementing or removing the assertion:
1. Global `AuditLogInterceptor` registered app-wide but persists nothing (TODO in code).
2. `AuditTrail.oldValues/newValues` never populated — the pre-image is fetched then discarded.
3. `nricHash`/`nricEncrypted` imply encryption that never runs; plaintext NRIC is live and logged.
4. "PDPA Consented" badge asserted by frontend hardcode; docs record PDPA as delivered.
5. `redactClaim` masks less than it appears (misses nested claimant NRIC, session risk data) and is absent from the Cases module entirely.
6. Adjuster credential fields + ticked docs checklist ("BCILLA ✅") with zero enforcement.
7. `slaDeadline` column implies turnaround tracking; nothing evaluates it.
8. Evidence checklist UI implies gating ("3 of 5 documents") that doesn't exist.
9. Signature completion endpoint is forgeable (stub provider, no role restriction).
10. `validationStatus` populated on every case document by a stub that always returns SKIPPED.

### 3.5 How 100% technical compliance is maintained

1. **Traceability**: every matrix row gets an ID; every implementing PR references row IDs; no control without a requirement, no requirement without a control.
2. **Enforcement in code**: gates are server-side (guards/transactions), never UI-only — e.g. junior report cannot reach ISSUED without senior sign-off; documents cannot be hard-deleted; status transitions role-gated.
3. **Compliance tests in CI**: automated tests assert each control ("junior cannot finalise report", "audit row written on every claim mutation", "SLA breach fires escalation"); the suite is demonstrable evidence in a s.146 examination.
4. **Live compliance dashboard** (Ph 3): matrix rendered from production data — e.g. % reports senior-signed, CPD standing, SLA hit rates, unresolved ComplianceEvents.

---

## 4. Domain model evolution

Conventions respected: kebab-case, British English, polymorphic subtables off `Claim`, data-driven registries (like `EvidenceRequirement`), provider plugin pattern (like FraudSignal providers / LlmProvider).

### 4.1 New entities

| Entity | Purpose | Key fields / relations |
|---|---|---|
| `Assignment` | The insurer appointment as first-class record | insurerTenantId, mode (TPA_ADMIN/ADJUSTING), channel (EMAIL/PORTAL/MERIMEN/API), receivedAt, scope, appointedBy, ackSentAt → Claim 1:1. Anchors the ≤1-day ack clock; Merimen ref field from day one |
| `AdjusterReport` | Core work product | claimId, type (PRELIMINARY/INTERIM/FINAL/SUPPLEMENTARY), structured sections (per-category template), version chain, authorId, reviewerId, signedById, status (DRAFT/IN_REVIEW/SIGNED/ISSUED), renderedDocumentId. Reuses pdfkit infra |
| `ReportTemplate` | Per category × report-type sections | Mandatory Methodology/Sources/Assumptions per PD 12.6. Registry pattern |
| `FeeScale` / `FeeNote` / `TimeEntry` / `Disbursement` | Billing | Per-tenant scales (SCALE/TIME/FIXED, bands, SST); fee note lifecycle DRAFT/ISSUED/PAID/DISPUTED; ageing for CSP fee monitoring |
| `SlaPolicy` / `SlaClock` | Deadlines | Policy: stage, workingDays, calendar. Clock: claimId, stage, startedAt, dueAt, pausedAt (awaiting-documents), breachedAt, escalationLevel. Replaces dead `slaDeadline` |
| `Notification` + Template + Log | Outbound comms | Channels EMAIL/SMS/WHATSAPP/IN_APP, locale EN/BM, approvedBy (Sch 7), delivery evidence. Provider plugin per channel |
| `Consent` | PDPA record | subjectType, purpose, grantedAt, withdrawnAt, capturedVia |
| `RetentionPolicy` | Retention/deletion | entityType, retainYears (default 7), legalHold per claim; scheduled jobs |
| `ConflictDeclaration` | COI | Standing declarations (adjusterId, relatedPartyType INSURER/WORKSHOP/CLAIMANT, relation) + per-assignment attestation |
| `AdjusterCompetency` | Skills/seniority | adjusterId, category, level, yearsInSubject, certifications. Activates dead bcillaCertified/amlaMember; drives <5-yr supervision rule |
| `CpdRecord` | CPD ledger | adjusterId, hours, programme, amlaRelated, year |
| `AuthorityLimit` | Monetary authority | role/adjusterId, category, maxRecommendationAmount, approvalChain. Fixes ADJUSTER self-approval |
| `ComplianceEvent` | Compliance register | type, severity, claimId?, raisedBy, boardReported |
| `BnmNotification` | PD 13.1 register | changeType, occurredAt, notifiedAt, dueAt (7 wkg days). Licensed mode only |
| Fit-and-proper record | PD 10.1/10.2 | Per shareholder/KRP attestation + supporting docs, re-attestation cycle (part of compliance module) |

### 4.2 Changes to existing entities

| Entity | Change |
|---|---|
| `Tenant` | Promote `settings` to structured config: fee scales, SlaPolicy set, fast-track thresholds, assessment-mode matrix, branding, LLM provider policy, `licensedMode` |
| `Claim` | Add assignmentId, assessmentMode, `documentsCompleteAt` (starts 10-day clock), reserve amount; server-side status transition guards (adopt the Cases transition-table pattern) |
| `Adjuster` | Wire dead fields; employmentType (FULL_TIME required in licensed mode); seniority via AdjusterCompetency; capacity config replaces hardcoded 10 |
| `AuditTrail` | oldValues/newValues; append-only (revoke UPDATE/DELETE at DB level); implement interceptor TODO; extend coverage to cases/policies/video/auth |
| `EvidenceRequirement` | Fix travel bug (claims.service.ts:534); non-motor requirement sets (fire/burglary/HOH/PA: bomba report, police report, invoices, valuation, medical); emit checklist-complete event |
| `FraudSignal` | Non-motor providers (Ph 4): invoice anomaly, burglary consistency, travel doc checks; live MetMalaysia data |
| `Case` | Channel values AGENT/BROKER/INSURER_FORWARDED; keep Case/Claim boundary (see §6.2) |

New NestJS modules (case-service unless noted): `reports/`, `assignments/`, `sla/`, `billing/`, `compliance/`, plus `notifications/` as its own concern. One durable queue (BullMQ on existing Redis) shared by SLA ticks, notifications, retention jobs, report rendering.

---

## 5. Phased roadmap

"Prod" = production-grade before MSIG go-live; "demo" = sufficient to validate, hardening deferred.

### Phase 0 — Immediate hotfixes (days, not weeks; before any new feature work)
Security/integrity defects confirmed by the compliance audit that cannot wait for Phase 1:
1. Commit + push the uncommitted travel work (`feature/non-motor-claims-ui`, no remote).
2. `@Roles` on all Cases endpoints (detail/mine/answers/upload/submit currently reachable by every authenticated role); redact bank details + claimant PII in Cases responses for non-adjusting roles.
3. Add `JwtAuthGuard` to `POST /claimants/verify-nric` (currently an unauthenticated NRIC-confirmation oracle).
4. Stop returning deception/risk data to claimants: fix `redactClaim` coverage (`sessions[].summary`, `deceptionData`, `riskAssessments`, `fraudSignals`, nested `claimant.nric`).
5. Restrict `POST /documents/:id/complete-signature` by role (currently any authenticated user can flip a document to SIGNED).
6. Remove NRIC from application logs (`claimants.service.ts:69`).
7. Remove or gate the false-comfort assertions (§3.6): hardcoded PDPA badge, "soft delete" comment over a hard delete, sovereignty docstrings that contradict defaults.
8. Cases module writes audit rows for every transition, `convert()` above all.
9. Legal review note: claimant-web title/PWA tagline "Insurance Claims Made Easy" vs FSA s.139.

### Phase 1 — Compliance foundation + professional core ("BNM-ready on paper")
- Report engine: AdjusterReport + templates (fire/property + travel), versions, review → senior sign-off workflow, PDF render — **prod**
- SLA engine: BullMQ, Malaysian working-day calendar, ACK ≤1 day / prelim / final ≤10 days clocks, pause-on-awaiting-documents, breach escalation — **prod**
- Notifications: email channel (real SMTP; Mailhog locally), EN/BM templates, delivery log, OTP off console — **prod**
- Evidential audit trail: interceptor implemented, before/after values, append-only, full coverage — **prod**
- PDPA minimum: Consent entity at intake, NRIC/bank encryption, remove hardcoded flag — **prod**
- Server-side status guards + basic AuthorityLimit (no self-approval) — **prod**
- Fix travel checklist bug; non-motor evidence sets — **prod**

**Exit criteria:** a claim runs intake → assessment → senior-signed final report PDF → issued, with every deadline clocked, every mutation audited, every message logged, consent recorded. Matrix rows 12.5, 12.6, 12.7(workflow), ACK/final CSP anchors, Sch 7 basics, s.146 readiness green.

### Phase 2 — Money + routing ("run MSIG properly")
- Billing: FeeScale, TimeEntry/Disbursement, FeeNote + SST, statements + ageing — **prod**
- Assessment-mode router + small-claims fast-track profile — **prod**
- Assignment entity + manual appointment capture + ack automation — **prod**
- Quantum worksheet (average, betterment, depreciation, excess) — **prod** fire/property, demo others
- RetentionPolicy engine — **prod**
- Tenant config surface (structured settings UI) — **prod**
- Local-LLM default for PII documents; per-tenant provider policy — **prod**
- Insurer-side clock monitoring (MI), s.143 export bundle — demo

**Exit criteria:** MSIG pilot end-to-end incl. fee note; small claim completes desk-review fast-track ≤3 wkg days; offshore-LLM exposure closed.

### Phase 3 — People engine (PD 12.x staffing standards)
- AdjusterCompetency, seniority (<5-yr rule), ConflictDeclaration + per-assignment gate, rotation counters, capacity config — **prod**
- Assignment engine: qualified-only (licensed mode), competency match, COI block, rotation warnings — **prod**
- Data-driven senior-countersign enforcement — **prod**
- CpdRecord ledger + dashboard; background-screening checklist; fit-and-proper records (10.1/10.2) — **prod** (data entry)
- ComplianceEvent register + Board export; COMPLIANCE_OFFICER first real screens — demo → prod
- Permissions matrix enforced server-side — **prod**

**Exit criteria:** every licensed-mode assignment passes competency + COI + rotation gates automatically; an examiner can be shown who did what, under whose supervision, with what CPD standing.

### Phase 4 — Non-motor assessment depth
- Site-visit inspection mode (mobile checklist, geotagged photos, offline tolerance) — **prod**
- Scope-of-loss / contents inventory with per-item valuation (burglary/HOH/fire) — **prod**
- Non-motor fraud providers (invoice anomaly, burglary consistency, travel docs); live MetMalaysia — demo → prod per provider
- Trinity rule packs for non-motor — demo
- SigningCloud provider wired (discharge voucher e-signing) — **prod**
- Expert-referral workflow (external expert record, instruction letter, report slot) — demo

### Phase 5 — Connectivity + regulated-mode completion
- Merimen intake integration (or structured email ingestion fallback) → auto-Assignment — **prod** (dependency-gated)
- WhatsApp intake channel (Business API) — **prod**
- AMLA screening provider + suspicious-matter escalation — **prod**
- BnmNotification register + licensed-mode flip (hard gates live, report labelling, registration display) — **prod**
- Template approval workflow (Sch 7 formal sign-off) — **prod**
- SMS channel; insurer status-push API — demo

### Phase 6 — MI + scale
MI dashboards (SLA per insurer, fee ageing, utilisation, fraud hit rates), regulatory-return extracts, multi-panel onboarding from tenant config, SHARIAH_REVIEWER surface if takaful panel lands, marine/aviation line if demanded.

---

## 6. Key risks & open decisions

1. **Uncommitted travel work** on `feature/non-motor-claims-ui`, no remote — commit + push first (Phase 0 item 1).
2. **Dual Case/Claim lifecycle** — keep the boundary (Case = pre-claim intake funnel; Claim = regulated engagement); adopt Case's transition-table pattern for Claim guards (Ph 1); revisit only if Assignment-without-Case proves awkward.
3. **Offshore LLM** — local (Ollama) default for PII docs from Ph 2; Gemini only under explicit per-tenant policy for non-PII. Until then: do not demo AI extraction on real claimant documents.
4. **Merimen dependency** — market's appointment rail but access is insurer-sponsored/uncertain. Assignment is channel-agnostic from Ph 2 (manual/email works); Merimen is an ingestion adapter (Ph 5), never a schema assumption. **Ask MSIG early which channel they will use.**
5. **Single-firm assumption** in `resolveCaseTenant` — acceptable now; documented constraint; breaks any future multi-firm SaaS ambition.
6. **No queue/scheduler exists** — BullMQ on existing Redis, one shared worker pattern; decide first because Phases 1–2 all sit on it.
7. **Regulatory interpretation** — have the Order's registration requirements and PD applicability confirmed by counsel before the licensed-mode flip (Ph 5). The system makes the facts demonstrable; it is not the legal opinion.
8. **MSIG is verbal** — keep Phases 1–2 client-agnostic; MSIG-specific behaviour lives only in tenant config.
9. **Stub debt** (signature provider, rainfall data, doc validation) — each scheduled; nothing ships "prod" while its stub is load-bearing for that phase's exit criteria.
10. **Three disconnected risk scores** (DeceptionScore, RiskAssessment, FraudSignal) — do not merge into one opaque number (itself a Sch 7/explainability risk); Ph 4 presents all three with provenance.

---

## 7. Verification

- **Per phase:** exit criteria above; each is demonstrable in the running system (portal :4000, claimant :4001).
- **Compliance:** matrix rows flip from FAIL/PARTIAL to PASS only with (a) server-side enforcement evidence and (b) a CI compliance test asserting the control. Current baseline: **0 PASS / 7 PARTIAL / 20 FAIL** — the matrix is re-audited at each phase exit and the trend is the firm's readiness metric.
- **Execution start (immediately after approval):** Phase 0 hotfixes (incl. commit/push the feature branch); write this plan to `docs/MASTER_PLAN.md`; then open Phase 1 with the BullMQ + working-day-calendar foundation, followed by the report engine.

*Plan provenance: drafted from a functional codebase audit (round 1), a per-requirement compliance verification audit with file:line evidence (round 2), and a cross-check review that corrected the matrix, added fit-and-proper coverage, and promoted urgent findings to Phase 0 (round 3). Regulatory sources: FSA 2013 (user-supplied PDF, section-level extraction), BNM/RH/PD 032-29 Adjusters PD (user-supplied PDF, read in full), BNM/RH/PD 029-69 CSP PD (fetched from BNM), market research on Malaysian adjusting practice.*
