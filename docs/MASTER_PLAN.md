# MASTER PLAN — True Claim Insight as the Operating System of a Malaysian Non-Motor Loss Adjusting Firm

## Context

The operator runs an unlicensed TPA (claims administration for insurers; MSIG verbally agreed as first client, white-label, multi-panel ambition) and intends to become a **BNM-registered adjuster** under the Financial Services Act 2013. The two governing documents — the FSA 2013 and BNM's *Registration Procedures and Requirements on Professionalism of Adjusters* (BNM/RH/PD 032-29, 29 Aug 2025) — plus the Claims Settlement Practices PD (CSP, BNM/RH/PD 029-69) define the obligations this system must embody. Compliance is non-negotiable: every binding requirement must map to an enforced system control.

This plan was produced from: (1) a full codebase audit, (2) paragraph-level extraction of the regulatory documents, (3) the CSP timeline anchors, (4) market research on Malaysian adjusting practice, and (5) the economics in `docs/MARKET_RESEARCH_TPA_REVENUE.md`, which governs the sequencing in §5 and the feasibility position in §9. A per-requirement compliance verification audit produced the verdict column in §3.

> **Cross-reference note.** Section numbers cited as "research §n" refer to `MARKET_RESEARCH_TPA_REVENUE.md` as at 30 July 2026 (§5 revenue paths, §6 cost/P&L, §7 verdict, §8 risk register, §9 partner ask, §10 unverified items). That document is actively revised — if its numbering shifts again, the figures used here (funding RM900k–1.4M vs RM300–500k, breakeven months 15–22, RM13–18M base steady state, RM8–12/claim Path C pricing) are the load-bearing values to re-verify, not the section labels.

### Scope — target claim lines

| | Lines |
|---|---|
| **In scope** | Fire/Property (incl. **flood**, lightning), burglary/theft, HOH, Construction & Engineering, Liability, MAT, Bonds, Workmen's Compensation, Miscellaneous — plus the PA class **excluding Individual PA**: Group PA, **Travel PA (travel insurance)**, riders, affinity |
| **Explicitly excluded** | **Motor** · **Individual PA** (standalone personal-accident adjudication) · **Medical & Health** |

Two consequences that recur throughout this plan:

- **Travel is a PA-class product, not a class of its own.** Malaysian travel insurance is written under the PA class (PA core benefits + travel-inconvenience add-ons). Travel claims are therefore in scope via Group/Travel PA, and the travel policy's *medical-expenses benefit* stays in scope as a travel benefit — while standalone Medical & Health insurance is out. This is why the already-built travel Cases line is on-strategy.
- **Motor code exists in the repo but is not a target.** `ClaimCategory.MOTOR`, the motor Trinity rule engine and the vehicle master data remain functional; they are legacy surface. Do not extend them. Where a choice arises between generalising motor code and building non-motor properly, build non-motor.

**Regulatory posture in one line:** adjusting is a *registered business* (FSA Sch 1 Pt 2 item 10) — registration arises by operation of law once the Order's requirements are met; BNM standards under s.18(2) are binding and monetary-penalty-exposed (Sch 15); a **registered** adjuster is a "financial service provider" caught by conduct rules (s.123/124 + Sch 7); BNM can examine without notice (s.146). The system is therefore the firm's compliance evidence.

---

## 1. Vision & operating model

### Decided trajectory: TPA first, registration when volume justifies it

This is settled, and it governs every sequencing decision in §5:

1. **Now — operate as a TPA** (claims administration for insurers, white-label) plus travel/Group PA volume. Funding need ~RM300–500k, near-breakeven in year 1 (§9.2). No regulated payroll.
2. **Then — apply for BNM registration** once claim volume supports two senior adjusting employees (RM24–40k/month) and the panel relationships exist to keep them busy.

The consequence for engineering is the whole point of this plan: **the foundations must be correct from day one so registration is a capability flip, not a rebuild.** Concretely that means, in the order it matters —

- **Build the regulated machinery early but ship it inert.** Report structure, review/sign-off workflow, competency and COI models, audit trail, retention: all present behind `licensedMode`, exercised in TPA mode without the hard gates. Retrofitting sign-off chains and evidential audit onto a year of live claims data is the expensive path.
- **Never encode an assumption that only holds today.** Two live examples: a single adjusting firm (§4.2 `resolveCaseTenant`) and TPA-only outputs. Both are cheap to keep open now and costly to open later.
- **Keep the record honest from the first claim.** The registration application's credibility rests on demonstrable practice — 7 years of retained records, audited decisions, disclosed methods. Records created before registration are exactly the evidence BNM will look at, so they must be right from the start rather than from the application date.

**The licence flag concept** — the TPA→adjuster transition is that capability flip:

| Mode | What the firm does | What the system enforces |
|---|---|---|
| `TPA` (today) | Claims administration on behalf of insurer; no independent adjusting opinion | Full workflow; outputs labelled "assessment summaries"; soft gates |
| `REGISTERED_ADJUSTER` | Independent appointed adjusting; issues adjuster's reports | Same workflow + hard gates: qualified-assignee-only, junior supervision + senior countersign, mandatory COI screen, BNM change notifications, CPD floor |
| MAT (marine/aviation) | In commercial scope; adjusting of **maritime and aviation losses is exempt from registration** (FSA s.17(2)(b)) | Same rigour, no registration gates. Build only when a client instructs it |

**White-label multi-panel:** each insurer is a `Tenant` (type INSURER) with its own branding, fee scales, SLA thresholds and assessment-mode routing — hung off the currently-unused `Tenant.settings`, promoted to a structured per-tenant config surface. The firm is one ADJUSTING_FIRM tenant.

**Product thesis — two engines, deliberately different.** The in-scope lines split into two operating models that share one platform:

| | Property/CAT engine | Travel & Group PA engine |
|---|---|---|
| Lines | Fire/property, flood, burglary, HOH, engineering, liability | Travel PA, Group PA, riders, affinity |
| Claim shape | Low volume, high value, lumpy, event-driven | High volume, low value (typically RM200–3,000), recurring |
| Assessment | Site visit / remote video, technical quantum | Document adjudication, no site visit |
| Registration | Registered adjusting work | Legal status **unverified** — may not be adjusting business at all (§9.6 gate G3) |
| Economics | High margin, catastrophe spikes (flood claims 2–5× surge) | Thin per case, covers the fixed base |

The wedge on the property side is the **assessment-mode router** (DESK_REVIEW / REMOTE_VIDEO / SITE_VISIT / EXPERT_REFERRAL by category + amount + fraud flags, per-tenant thresholds) combined with CSP turnaround compliance and catastrophe surge capacity — precisely where the incumbents' site-visit model is structurally weak. The wedge on the travel side is speed and volume: competitors already pay flight-delay claims instantly, so parity is the floor, not the differentiator.

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

### 2.5 The assessment mode is also the cost control

Travel/Group PA revenue is **RM8–12 per claim** (research §5, Path C), against an insurer's internal handling cost of ~RM20–80. At that price the platform's per-claim COGS decides whether the line makes money — and the expensive components already exist in the codebase and will silently run on everything unless the router stops them.

**Binding rule: the assessment mode sets the COGS ceiling.**

| Mode | Permitted per-claim spend | Explicitly not permitted |
|---|---|---|
| `DESK_REVIEW` (the Path C default) | Document extraction only, on **in-country** inference. Target **≪ RM5/claim** | No video session, no Hume prosody/face analysis, no per-minute vendors, no eKYC unless a flag demands it |
| `REMOTE_VIDEO` | Video + behavioural analysis justified by claim value | — |
| `SITE_VISIT` / `EXPERT_REFERRAL` | Travel time / expert fee; priced into the fee note | — |

Escalation to a paid modality must be **triggered** (a fraud signal ≥ MEDIUM, an amount revision, an AI-extraction inconsistency) and recorded — never the default. Two present-day hazards this rule closes: `GeminiLlmProvider` is a paid offshore API on the default path, and `risk-analyzer` performs Hume prosody/face analysis per session; either running on every RM10 travel claim inverts the unit economics. Phase 1b implements the router with this ceiling as an enforced constraint, not a guideline.

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
| s.123/124 + Sch 7 | No misleading/deceptive claimant-facing statements incl. AI outputs. **Applicability:** s.121 defines "financial service provider" as an *authorized* or *registered* person, so these duties attach **on registration**. Unregistered today, the operator is bound instead by (a) its contract with the insurer, which flows down the insurer's own Sch 7 duties, (b) the CSP PD via the insurer, and (c) general consumer-protection and misrepresentation law. Practically the same bar; state it accurately rather than overstating present direct exposure | **FAIL** — no content governance; and `GET /claims/:id` returned deception scores/risk data to claimants (fixed in Phase 0) | Versioned, compliance-approved templates; LLM output never verbatim to claimants | 0 (redaction, done) / 1 (template flag) / 5 (formal approval) |
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

### 3.7 When each obligation actually bites

The matrix above is the *target* state. Which rows are live obligations depends on operating mode, and the plan should not pretend otherwise:

| Obligation set | Unregistered TPA (today) | On registration |
|---|---|---|
| PDPA 2010 (consent, security, retention, cross-border) | **Live now** — applies to any data user | Live |
| Insurer contract + vendor security assessment (ISO 27001-grade controls, data residency, audit rights) | **Live now** — commercially gating, insurers will not onboard without it | Live |
| CSP PD timelines | Indirect — flowed down by the insurer contract; the firm's SLA promises are contractual | Direct on registered adjusters |
| BNM Adjuster PD 10–13 (fit & proper, COI, competency, supervision, sign-off, 7-yr records, CPD, notifications) | Not applicable — but **evidence of these practices is what makes the registration application credible** | **Binding**, Sch 15 penalty-exposed |
| FSA ss.123–124 + Sch 7, s.143 submission, s.146 examination | Indirect (via insurer) | **Direct** |

Read together: nothing in Phase 1 is wasted, but the *reason* to build it now is PDPA + insurer procurement + registration readiness — not present-day BNM enforcement risk.

### 3.5 How 100% technical compliance is maintained

1. **Traceability**: every matrix row gets an ID; every implementing PR references row IDs; no control without a requirement, no requirement without a control.
2. **Enforcement in code**: gates are server-side (guards/transactions), never UI-only — e.g. junior report cannot reach ISSUED without senior sign-off; documents cannot be hard-deleted; status transitions role-gated.
3. **Compliance tests in CI**: automated tests assert each control ("junior cannot finalise report", "audit row written on every claim mutation", "SLA breach fires escalation"); the suite is demonstrable evidence in a s.146 examination. ⚠️ **This mechanism does not exist yet** — there are zero tests and no CI in the repository (§4.3 A4). Standing it up is a Phase 0b item, because until it exists every "PASS" in §3 rests on manual verification alone.
4. **Live compliance dashboard** (Ph 3): matrix rendered from production data — e.g. % reports senior-signed, CPD standing, SLA hit rates, unresolved ComplianceEvents.

---

## 4. Domain model & architecture

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
| `EvidenceRequirement` | Fix travel bug (claims.service.ts:534); in-scope requirement sets (fire/flood/burglary/HOH: bomba report, police report, purchase invoices, valuation/quantum surveyor docs, inventory list, Group PA: employer confirmation + medical certificate); emit checklist-complete event |
| `FraudSignal` | Non-motor providers (Ph 4): invoice anomaly, burglary consistency, travel doc checks; live MetMalaysia data |
| `Case` | Channel values AGENT/BROKER/INSURER_FORWARDED; keep Case/Claim boundary (see §6.2) |
| `ClaimCategory` | Today: MOTOR, FLOOD, FIRE, LIGHTNING, BURGLARY, PERSONAL_ACCIDENT, HOH, TRAVEL, OTHER. The in-scope lines **Engineering, Liability, MAT, Bonds and Workmen's Compensation have no enum value** — add each only when a client instructs that line (adding a value is a migration + a `category-config` entry + an evidence set, i.e. cheap on demand and pointless in advance). Repurpose `PERSONAL_ACCIDENT` for **Group PA only**; Individual PA is out of scope and must not be marketed on it |

New NestJS modules (case-service unless noted): `reports/`, `assignments/`, `sla/`, `billing/`, `compliance/`, plus `notifications/` as its own concern. One durable queue (BullMQ on existing Redis) shared by SLA ticks, notifications, retention jobs, report rendering.

---

### 4.3 Architecture assessment (audited 30 July 2026)

The question asked was "is the system design properly done?" — answer: **not yet.** Three defects are blocking. Each was demonstrated against the running system, not inferred from reading code.

#### Blocking

| # | Defect | Evidence | Fix |
|---|---|---|---|
| **A1** | **No authentication between services.** `InternalAuthGuard` (`apps/case-service/src/common/guards/internal-auth.guard.ts:27`) trusts three plain HTTP headers with no credential. Its own comment says production needs an API key or mTLS; that was never done | Sending `X-User-Id: forged`, an arbitrary `X-Tenant-Id` and `X-User-Role: FIRM_ADMIN` directly to `:3001` returned real claim records. `main.ts:112` binds `0.0.0.0`, and no Kubernetes network policy exists to contain it. **Blast radius: full cross-tenant read/write of claimant PII** | Shared internal secret validated on every service-to-service call (~half a day), mTLS when infrastructure exists |
| **A2** | **Four services share one database with no data ownership.** `video-service/rooms.service.ts:54,85` writes `Claim`; `video-service/uploads.service.ts` and two `risk-engine` files write `Document`; `api-gateway` writes four domains directly (otp, claimants, master-data, users). A distributed monolith: microservice cost (four deploy units, network hops, **no cross-service transactions**) with monolith coupling (any service can corrupt any table) | grep of `prisma.<table>.create/update` per service | Enforce ownership at the API boundary — see recommendation below |
| **A3** | **No segregation of duties.** The 20-permission × 8-role matrix in `adjuster-portal/src/lib/permissions.ts` is frontend-only, and the same role holds `claims:assign` and `claims:approve` | A plain `ADJUSTER` token moved a claim to `APPROVED` through the API with no authority check | `AuthorityLimit` + server-side status guards — already scoped in Phase 1a |

#### Material

| # | Defect | Note |
|---|---|---|
| **A4** | **Zero tests, no CI** | Not one test file exists (only third-party ones inside the Python venv); four services declare `"test": "jest"` with nothing to run; no `.github/workflows`. Critical because §3.5 makes "compliance tests in CI" the *entire* mechanism for evidencing controls under FSA s.146 — that mechanism currently has no foundation |
| **A5** | **No deployment artefacts** | No Dockerfiles, no `infrastructure/` directory, despite `CLAUDE.md` documenting Docker 27 + EKS + Terraform. Insurer vendor assessments ask for deployment, DR and network topology. This is also where the network policy mitigating A1 would live |
| **A6** | **No observability** | No Sentry / OpenTelemetry / metrics — only the default Nest logger. Cannot evidence SLA performance or investigate an incident, both of which the CSP turnaround story depends on |
| **A7** | **`api-gateway` is not a gateway** | It proxies most routes while owning four domains, validates little, and forwards `any` in places. Pick one identity: stateless edge (auth, rate limiting, routing) or a BFF that owns those domains deliberately |
| **A8** | **Documentation describes services that don't exist** | `identity-service`, `document-service`, `insurer-dashboard` are empty directories in `CLAUDE.md`'s architecture — the same false-comfort pattern as §3.6. Correct `CLAUDE.md` |

#### A2 resolution — declared bounded contexts, enforced (decided: future-proof approach)

Rather than choosing between "move code into case-service" and "leave it and be careful", ownership is **declared as data and enforced by a test**. This survives future service splits or merges, because the contexts follow the domain rather than today's process boundaries.

| Context | Owner today | Tables |
|---|---|---|
| `identity` | api-gateway (natural seam if an identity-service is ever extracted) | user, userTenant, tenant, tenantAccessLog, otpCode, claimant |
| `claims` | case-service | claim, case, caseDocument, document, policy, claimNote, floodClaim, travelClaim, evidenceRequirement, adjuster, auditTrail |
| `assessment` | video-service + risk-engine | session, sessionClientInfo, videoUpload, deceptionScore, riskAssessment, trinityCheck, documentAnalysis, fraudSignal |
| `reference` | api-gateway | vehicleMake, vehicleModel (motor legacy) |

Declared in `packages/prisma-client/src/data-ownership.ts`; enforced by `apps/case-service/src/common/data-ownership.spec.ts`, which scans every service's source for Prisma write calls and fails on any cross-context write. **Reads are permitted** — cross-context reads are a coupling smell, not a corruption hazard, and forbidding them would need an API layer that does not exist yet.

**Six known violations are declared as exceptions**, each with a named resolution, and the list is a **ratchet the test enforces — it may shrink, never grow**:

| Service → table | Resolution |
|---|---|
| video-service → `claim` | Call case-service `PATCH /claims/:id/status` over the internal channel |
| video-service → `document` | Call case-service `POST /claims/:claimId/documents` |
| video-service → `user` | Read-only lookup; no writes to identity |
| risk-engine → `document` | Case-service endpoint for analysis results to update document state |
| risk-engine → `floodClaim` | Emit the FraudSignal only; case-service applies the parametric flag |
| case-service → `claimant` | Gateway resolves the claimant and passes `claimantId` |

Why a static test rather than a runtime Prisma extension: `$extends` returns a *new* client object, so adopting it would churn every call site in four services, and it catches violations only when the code path runs. The static scan catches them at review time. Runtime enforcement becomes worthwhile once the exception list is empty and call sites are being refactored anyway — recorded as a follow-up, not built speculatively.

#### Recommendation on structure

**Do not do a big-bang merge.** The cheap fix captures most of the value: **enforce data ownership at the API boundary** — `video-service` and `risk-engine` call case-service endpoints instead of writing its tables; `api-gateway` either hands its four domains to case-service or is acknowledged as a BFF that owns them. Days, not weeks, and it removes the silent-corruption failure mode without a rewrite.

Merging is the fallback if ownership enforcement proves awkward. If it comes to that, the honest end state for a one-engineer team is **two backend services** — one core API plus `risk-analyzer`, which genuinely warrants a separate Python/ML runtime — and two frontends. The current seven-way split is not earning its operational cost. Either way: **stop adding services.**

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

### Phase 0b — Architecture hardening (~1 week; before further feature work)
From the architecture audit (§4.3). A1 comes first: until it is fixed, every other control in this plan can be bypassed by anyone who can reach port 3001, which makes the PDPA and vendor-assessment story indefensible.

1. **A1 — internal service authentication.** Shared internal secret (env-configured) validated by `InternalAuthGuard` on every service-to-service call; reject requests carrying identity headers without it. Bind services to localhost in dev, and record mTLS as the production step once deployment artefacts exist — **prod**
2. **A2 — data ownership decision + enforcement.** `video-service` and `risk-engine` stop writing case-service tables (`Claim`, `Document`) and call case-service endpoints instead. Decide explicitly whether `api-gateway` keeps its four owned domains (otp, claimants, master-data, users) as a BFF or hands them over — record the decision either way — **prod**
3. **A4 — minimal CI + the first compliance test.** GitHub Actions running typecheck across all five apps plus one real compliance test (suggested first: "a claimant token cannot read deception data"). §3.5 makes CI the evidencing mechanism for FSA s.146, so it must exist before the plan starts depending on it — **prod**
4. **A8 — correct `CLAUDE.md`**: remove `identity-service`, `document-service`, `insurer-dashboard` and the `infrastructure/` tree from the documented architecture, or create them. Do not leave documentation describing services that do not exist — **prod**

Deferred from this phase but tracked: **A5** deployment artefacts (needed for the network policy that properly contains A1, and for insurer vendor assessment), **A6** observability (needed to evidence SLA performance), **A7** gateway identity clean-up. **A3** is already scoped inside Phase 1a as `AuthorityLimit`.

**Exit:** a forged-header request to any service is rejected; no service writes another service's tables; CI is green on every push and fails on a broken control; the documented architecture matches the repository.

### Phase 1 — Compliance foundation + professional core
Split into three shippable stages (§9.3–9.4): ~13–19 engineer-weeks in total, ordered so the work that unblocks insurer onboarding and revenue lands before the work that only pays off once senior adjusters are hired.

#### Phase 1a — "Operate honestly" (~5–7 weeks) · unblocks insurer vendor assessment
- Evidential audit trail: interceptor persists, before/after values, append-only at DB level, coverage across cases/policies/video/auth — **prod**
- PDPA minimum: `Consent` entity captured **before** processing, NRIC/bank field encryption with key management, backfill of existing plaintext, `isPdpaCompliant` derived from a real consent record — **prod**
- Notifications: email transport (real SMTP; Mailhog locally), EN/BM templates, delivery log, OTP off console — **prod**
- Server-side status guards + basic `AuthorityLimit` (no self-approval) — **prod**
- **Foundations items (cheap now, expensive later — see §6.5, §6.14):** resolve the handling firm explicitly in `resolveCaseTenant` instead of "first `ADJUSTING_FIRM` found"; fix the travel evidence-checklist filter (`claims.service.ts:533`); rename `PolicySource.SCRAPED` → `FILE_FEED`; populate `oldValues/newValues` in `claims.service.createAuditTrail` (the pre-image is already fetched at line 332 and discarded) — **prod**

**Exit:** every mutation audited with before/after; consent is a record, not a badge; no single-firm assumption remains in the code; the firm can answer "who did what, when, and on whose instruction" — the questions an insurer's vendor assessment asks. PDPA rows and s.146 readiness green.

#### Phase 1b — "Promise and keep turnaround" (~4–6 weeks) · unblocks the value proposition
- SLA engine: BullMQ on existing Redis, Malaysian working-day calendar (national + state holidays), clocks for ACK ≤1 day / preliminary / final ≤10 days from `documentsCompleteAt`, pause-on-awaiting-documents, breach escalation — **prod**
- Assessment-mode router + small-claims fast-track profile (per-tenant thresholds), **enforcing the §2.5 COGS ceiling** — a `DESK_REVIEW` claim must be structurally incapable of invoking video, biometric or per-minute vendors without a recorded escalation trigger — **prod**
- Fix travel checklist bug (`claims.service.ts:534`); in-scope evidence requirement sets; checklist-complete event that starts the final-report clock — **prod**

**Exit:** a fast-track desk-review claim completes inside its SLA with the clock visible and breaches escalating. Matrix row 12.5 and the CSP ACK/final anchors green.

#### Phase 1c — "Work product" (~4–6 weeks) · registration readiness, ships inert
- Report engine: `AdjusterReport` + `ReportTemplate` (fire/property first, then travel), versions, review → sign-off workflow, mandatory Methodology/Sources/Assumptions sections (PD 12.6), PDF render on the existing pdfkit infrastructure — **prod**
- Senior-countersign workflow present and enforced **when `licensedMode` is on**; in TPA mode the same engine issues "assessment summaries" without the countersign gate — **prod**

**Exit:** a claim runs intake → assessment → senior-signed final report PDF → issued. Matrix rows 12.6 and 12.7 (workflow) green; 12.7 data-driven enforcement follows in Phase 3 once competency data exists.

> **Gate before Phase 2:** answer **G2** (MSIG's appointment channel) and **G3** (is desktop travel adjudication regulated?) from §9.6. Both change what Phase 2 should build.

### Phase 2 — Ingestion + routing ("run MSIG properly")
- **Inbound parsing (moved up from Phase 5 — this is the MSIG pilot's primary intake):**
  - FNOL email ingestion from the dedicated inbox → auto-create `Case` (channel EMAIL), attach the email's documents, attempt policy match, flag unmatched for the operator
  - **Policy data file feed** from the insurer (SFTP or dedicated inbox, agreed CSV/Excel schema) → upsert `Policy`. Rename `PolicySource.SCRAPED` → `FILE_FEED` as part of this work; see §6.11 on why portal scraping is not an option — **prod**
- `Assignment` entity + manual appointment capture + ack automation — **prod**
- Quantum worksheet (average, betterment, depreciation, excess) — **prod** fire/property, demo others
- RetentionPolicy engine — **prod**
- Tenant config surface (structured settings UI) — **prod**
- Local-LLM default for PII documents; per-tenant provider policy — **prod** *(closes the §6.3 exposure; must land before any public claim of in-country AI processing)*
- Insurer-side clock monitoring (MI), s.143 export bundle — demo
- Billing (FeeScale / FeeNote / SST) — **only when the trigger below is met**

**Exit criteria:** an emailed FNOL becomes a matched, vetted case without manual keying; MSIG pilot runs end-to-end; a small claim completes desk-review fast-track ≤3 wkg days; offshore-LLM exposure closed.

> **Billing timing (§9.3):** at pilot volumes, invoicing from accounting software is rational. Build `FeeNote`/`FeeScale` when volume passes roughly 20 claims/month **or** when G1 (validated fee scales) lands — whichever comes first. Do not build it on assumed fee structures.

### Phase 3 — People engine (PD 12.x staffing standards)
> **Gated on hiring**, not on engineering: this phase only becomes real once adjusting employees exist to hold competencies, seniority and CPD records. Build it when the funding decision in §9.2 is made; before that, the schema can land but the screens have no data.
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
- Merimen appointment-rail integration → auto-`Assignment` — **prod** (dependency-gated on G2; email ingestion from Phase 2 is the fallback that makes this optional)
- **Proactive outbound intake** (WhatsApp Business API + SYSTEM-initiated pre-filled cases). Note the two dependencies that do not exist yet and are not in the cost model: (a) a **flight-status data feed**, and (b) **itinerary-level policy data** from the insurer — without both, incident detection cannot work, so this is gated on the Phase 2 policy feed carrying travel dates and flight details. Competitors already pay flight-delay claims instantly, so treat this as parity, not differentiation — **prod**
- AMLA screening provider + suspicious-matter escalation — **prod** (scope set by gate G8)
- `BnmNotification` register + licensed-mode flip (hard gates live, report labelling, registration display) — **prod**
- Template approval workflow (Sch 7 formal sign-off, now directly applicable) — **prod**
- SMS channel; insurer status-push API — demo

### Phase 6 — MI + scale
MI dashboards (SLA per insurer, fee ageing, adjuster utilisation, fraud hit rates), regulatory-return extracts, multi-panel onboarding from tenant config, **catastrophe surge-capacity product** — *gated on G10: no insurer is known to buy one today, and honouring it requires a standby contractor pool* — SHARIAH_REVIEWER surface if a takaful panel lands, new `ClaimCategory` values as clients instruct those lines (engineering, liability, MAT, bonds, WC).

---

## 6. Key risks & open decisions

1. **Uncommitted travel work** on `feature/non-motor-claims-ui`, no remote — commit + push first (Phase 0 item 1).
2. **Dual Case/Claim lifecycle** — keep the boundary (Case = pre-claim intake funnel; Claim = regulated engagement); adopt Case's transition-table pattern for Claim guards (Ph 1); revisit only if Assignment-without-Case proves awkward.
3. **Offshore LLM** — local (Ollama) default for PII docs from Ph 2; Gemini only under explicit per-tenant policy for non-PII. Until then: do not demo AI extraction on real claimant documents.
4. **Merimen dependency** — market's appointment rail but access is insurer-sponsored/uncertain. Assignment is channel-agnostic from Ph 2 (manual/email works); Merimen is an ingestion adapter (Ph 5), never a schema assumption. **Ask MSIG early which channel they will use.**
5. **Single-firm assumption — fix it now, it is a foundations item.** `resolveCaseTenant` currently resolves a claimant self-serve case to "the first `ADJUSTING_FIRM` tenant found". That is the one place the codebase assumes a single adjusting firm, and it is the cheapest possible moment to remove it. The rest of the platform is already genuinely multi-tenant (`Tenant` with ADJUSTING_FIRM/INSURER types, `UserTenant` m:n, tenant-scoped queries and redaction), so the fix is small: resolve the **handling firm explicitly** — from the insurer's panel configuration, the intake channel, or the `Assignment` — instead of picking one arbitrarily. **Phase 1a.** Doing this does not build a SaaS product; it merely stops foreclosing Path B (§6.14) for the sake of one convenience shortcut.
6. **No queue/scheduler exists** — BullMQ on existing Redis, one shared worker pattern; decide first because Phases 1–2 all sit on it.
7. **Regulatory interpretation** — have the Order's registration requirements and PD applicability confirmed by counsel before the licensed-mode flip (Ph 5). The system makes the facts demonstrable; it is not the legal opinion.
8. **MSIG is verbal** — keep Phases 1–2 client-agnostic; MSIG-specific behaviour lives only in tenant config.
9. **Stub debt** (signature provider, rainfall data, doc validation) — each scheduled; nothing ships "prod" while its stub is load-bearing for that phase's exit criteria.
10. **Three disconnected risk scores** (DeceptionScore, RiskAssessment, FraudSignal) — do not merge into one opaque number (itself a Sch 7/explainability risk); Ph 4 presents all three with provenance.
11. **Portal scraping is not an available option — decided.** A proposal existed to scrape the insurer's agency portal for policy data and describe it externally as "a dedicated team reviewing policies". This plan rejects it on three independent grounds: the insurer has already stated that agents/adjusters may not log into its system, so automated access breaches the access terms and risks the Computer Crimes Act 1997; describing automation as a human team misrepresents the service to the client whose data is at stake; and either, if discovered during a vendor security assessment, ends the relationship and damages the registration application. **The sanctioned path is a structured policy file feed** (SFTP or an agreed inbox schema) — Phase 2, `PolicySource.FILE_FEED`. If the insurer declines a feed, the fallback is manual keying of the emailed data, not scraping.
12. **AI is disclosed, not downplayed — decided.** A position existed to use AI internally while minimising it externally. BNM PD **12.6** requires the adjusting report to disclose the facts, assumptions, **methods**, sources and databases behind the assessment, so AI contribution to an assessment is a disclosable method. The defensible posture is the one the system already supports: human-in-the-loop sign-off, full audit trail with before/after values, explicit methodology sections, provenance kept on each risk signal, and no automated decision on medical claims. Downplaying invites the scrutiny it is meant to avoid; documented explainability answers the regulator's actual concern (accountability), and is also what insurer vendor assessments ask for.
14. **Path B (platform sold *to* insurers and other adjusting firms) — kept open, not built.** The research values it at RM0.4M / RM2.3M / RM6–8M ARR and the §7 verdict names it one of only three routes to an outcome larger than a RM13–18M services business. This plan does **not** build it: with a TPA-first trajectory the near-term buyer is the insurer, not a peer adjusting firm. But it must not be foreclosed by accident, which is why item 5 is a Phase 1a fix rather than an accepted constraint. Decision rule: **keep multi-firm tenancy structurally possible at near-zero cost; build Path B only against a signed pilot with a firm that is not ours.** Revisit if an incumbent (Sedgwick / McLarens / Crawford / MAC) opens a licensing conversation — the research flags that as an untested but plausible channel.
15. **Do not claim in-country AI processing until it is true.** The live default is Gemini (offshore) whenever `GEMINI_API_KEY` is set, and the "sovereign" Ollama path defaults to an ephemeral Cloudflare tunnel. Until Phase 2 lands real in-country hosting, any external statement must be framed as a dated architecture commitment, not a present fact. See §3.6 item 10 and §6.3.
16. **Service-to-service trust is the largest single exposure (§4.3 A1).** Demonstrated: forged identity headers to `:3001` return real claim data, with services bound to `0.0.0.0` and no network policy. Every control in §3 — role gating, redaction, tenant isolation, audit — sits *behind* the gateway and is bypassed entirely by a direct call. Treat this as the first work item of Phase 0b, not a backlog entry. Until it is closed, do not expose any service beyond localhost and do not put real claimant data in a shared environment.
17. **"Microservices" is currently a distributed monolith (§4.3 A2).** Four services write one database with no ownership boundaries, so a schema change can silently break three services and any service can corrupt any table — while cross-service operations have no transaction. The decided response is to enforce ownership at the API boundary rather than merge services, and to **stop adding services**. If ownership enforcement proves awkward, the fallback end state is two backend services (core API + `risk-analyzer`) plus two frontends.

---

## 7. Verification

- **Per phase:** exit criteria above; each is demonstrable in the running system (portal :4000, claimant :4001).
- **Compliance:** matrix rows flip from FAIL/PARTIAL to PASS only with (a) server-side enforcement evidence and (b) a CI compliance test asserting the control. Current baseline: **0 PASS / 7 PARTIAL / 20 FAIL** — the matrix is re-audited at each phase exit and the trend is the firm's readiness metric.
- **Feasibility gates:** the §9.6 go/no-go questions are checked at the phase boundaries stated there. Engineering must not outrun validated economics — in particular G2/G3 before Phase 2, and the §9.2 funding decision before Phase 3.
- **Architecture gate:** the three blocking defects in §4.3 (A1 service auth, A2 data ownership, A3 segregation of duties) must be closed before the platform holds real claimant data in any shared environment. A1 and A2 are Phase 0b; A3 is Phase 1a.
- **Execution order:** Phase 0 hotfixes (done — `e404fc5`), Phase 1a foundations batch (done — `939ac39`), then **Phase 0b architecture hardening**, then the remainder of Phase 1a (audit interceptor + consent/encryption + notifications + status guards), 1b (SLA engine + assessment-mode router), 1c (report engine).

---

## 8. Progress record

**Keep this section current after every completed item** — it is the context handover between working sessions. Commit refs are on `feature/non-motor-claims-ui`.

### Phase 0 — complete ✅ (`e404fc5`)
All nine items done and verified: `@Roles` on every Cases endpoint (SUPPORT_DESK → 403 confirmed), bank details and answers omitted from the queue listing, `verify-nric` throttled with non-enumerating errors, `complete-signature` restricted to firm admins, `redactClaim` extended (nested claimant NRIC fail-closed, session deception/fraud data stripped for claimant + support desk), NRIC removed from logs, Cases audit rows on every transition incl. `convert()`, false-comfort assertions corrected, branch committed and pushed.

### Architecture audit — complete, 30 July 2026 (findings in §4.3)
Verdict: **the system design is not yet sound.** Three blocking defects (A1 no service-to-service auth — demonstrated; A2 shared database with no data ownership; A3 no segregation of duties — demonstrated) plus five material ones (A4 zero tests/no CI, A5 no deployment artefacts, A6 no observability, A7 gateway identity, A8 documentation describes non-existent services). **Phase 0b now precedes further feature work.** Method note: three delegated auditor agents were dispatched and none returned findings; everything in §4.3 is first-hand verification against the running system.

### Phase 0b — Architecture hardening: 3 of 4 done

| Item | State |
|---|---|
| **A1 internal service auth** | ✅ `9c10847`. `InternalHttpModule` injects `x-internal-key` as an axios instance default so none of the ~27 gateway call sites can forget it; the three internal services require it before honouring identity headers and **fail closed** when unconfigured. Deliberately excluded from the `ocr` and `location` modules, which call third-party hosts. Verified: forged headers → 403 (with and without a wrong key), all staff and claimant flows → 200/201 |
| **A4 CI + first compliance tests** | ✅ `.github/workflows/ci.yml` (typecheck job across six apps + compliance job) and **27 passing tests** in two suites: `tenant.service.spec.ts` (PII redaction, NRIC fail-closed masking, behavioural/fraud data withheld from claimants and support desk, private-note isolation) and `case-flows.spec.ts` (CSP 24h/30-day flags stay advisory, evidence completeness counts mandatory only, flow integrity, the "D7 522" alphanumeric-flight-code regression). Both suites are pure functions, so no database is needed in CI |
| **A8 documentation correction** | ✅ `CLAUDE.md` now reflects reality: the three phantom services and the `infrastructure/` tree are listed as *not built*; AWS/EKS marked as target-not-actual; third-party integrations split into integrated vs not, with the offshore data-residency caveat stated |
| **A2 data ownership** | ◐ **foundation done** — bounded contexts declared and enforced by test (§4.3 A2 resolution); the six existing violations are declared exceptions on a shrink-only ratchet. **Remaining:** work the six exceptions down to zero, each by calling the owning service instead of writing its tables. New violations are now impossible to add unnoticed |

A5 (deployment artefacts), A6 (observability), A7 (gateway identity) remain tracked and deferred. A3 (segregation of duties) is in Phase 1a as `AuthorityLimit`.

### Phase 1a — in progress (~15% → foundations batch done, `939ac39`)

| Item | State |
|---|---|
| Travel evidence-checklist subtype scoping | ✅ 4-level precedence; FLIGHT_DELAY returns 3 requirements, was 16 |
| `oldValues/newValues` on claim audit rows | ✅ field-scoped diff, JSON-safe, pre-image captured pre-write and unredacted; wired to CLAIM_UPDATED / STATUS_CHANGED / ADJUSTER_ASSIGNED |
| Explicit handling-firm resolution | ✅ insurer panel nomination → `HANDLING_FIRM_TENANT_ID` config; single-firm assumption removed |
| `PolicySource.SCRAPED` → `FILE_FEED` | ✅ enum migration applied |
| Build gate | ✅ all five apps typecheck clean (two pre-existing claimant-web errors cleared) |
| Global `AuditLogInterceptor` persistence | ⬜ still a TODO — writes nothing |
| Audit coverage: policies / video-service / auth | ⬜ zero rows |
| `audit_trail` append-only at DB level | ⬜ table still mutable |
| `Consent` entity + capture before processing | ⬜ **blocked on consent wording (EN/BM)** |
| NRIC/bank field encryption | ⬜ **blocked on key-custody decision** |
| Notifications (email transport, templates, delivery log) | ⬜ **blocked on SMTP provider**; queue decision pending |
| Server-side status guards + `AuthorityLimit` | ⬜ |

### Open decisions blocking further Phase 1a work
1. **Encryption key custody** — KMS envelope encryption vs configured master key. Blocks the encryption item; migrating encrypted data later is painful.
2. **BullMQ now or in 1b** — recommendation: now, since notification delivery reliability wants it and 1b needs it regardless.
3. **Consent wording (EN + BM)** and an SMTP provider account.

### Known non-blocking defects
- `Claim.claimType` is null for every non-motor claim, so the claimant app renders a blank "Claim Type" label. Cosmetic; the real subtype lives on `TravelClaim.travelClaimType`. Fix when the claimant claim-detail view is next touched.

---

## 9. Feasibility check

Neutral read against `docs/MARKET_RESEARCH_TPA_REVENUE.md`. The conclusion is **conditionally feasible** — the technology is the easy part; regulated headcount, funding and panel access are the constraints, and the phase plan must not run ahead of them.

Given the decided trajectory in §1 (TPA now, registration later), the **near-term funding case is the Path C column** — RM300–500k and near-breakeven — not the RM900k–1.4M registered route. The registered-route economics in §9.2 remain the plan of record for the *second* step, and the §9 partner ask in the research (a qualified non-motor adjuster, panel access, funding) is what converts step 1 into step 2.

### 9.1 The constraint that engineering cannot solve

BNM PD 12.1/12.2 require adjusting work to be done **only by the firm's own full-time adjusting employees**; 12.3 requires a supervised year for new employees; 12.4/12.7 require reports by anyone with **under 5 years in that subject matter** to be signed off by a senior with 5 years in it.

- Senior non-motor adjusters: **RM12,000–20,000/month**; **two is the practical minimum** (one senior means losing that person halts all sign-off).
- AI raises throughput — plausibly 40–60 → 100–150 cases/adjuster/month — but **cannot reduce headcount below the lawful sign-off minimum**.
- 55 registered firms compete for the same scarce talent.

So: **talent, not technology, gates the registered route.** A credible alternative is acquiring or partnering with a small existing registered firm rather than building the credential from zero — worth pricing before committing to the hiring path.

### 9.2 Funding reality (research §6.4)

| | Registered adjuster (A) + travel/PA (C) | Travel/PA platform only (C), unregistered |
|---|---|---|
| Year-1 revenue | RM300k–600k | RM100k–400k |
| Year-1 result | **(RM450k–1.02M)** | **(RM250k) to +RM100k** |
| Year-1 funding need | **RM900k–1.4M** | **RM300k–500k** |
| Breakeven | months 15–22 (base) | materially sooner |

Dominant variable is **time-to-first-panel-appointment** (6–12 month insurer procurement cycles), because regulated payroll burns whether or not instructions flow. Steady state is a **15–25% EBITDA services business with a software layer** on a **RM60–150M addressable** national pool — a solid niche, not a venture-scale volume market.

### 9.3 What this means for the phase plan

The plan's original instinct — lead with the adjuster's report engine to be "BNM-ready" — is **premature if the near-term business is TPA administration plus travel/PA volume**, because:

- The report engine with senior countersign only produces value once there are **senior adjusters to sign** and **appointments to report on**. Both are funding-gated.
- What actually unblocks near-term revenue is duller: **PDPA compliance, evidential audit and information-security posture** (insurers will not onboard a vendor without them), **notifications** (you cannot chase documents without email), and **turnaround measurement** (you cannot promise an SLA you cannot see).
- Billing can stay manual far longer than it feels: at pilot volumes, invoicing from accounting software is rational; a `FeeNote` module before ~20 claims/month is premature optimisation.

Recommended re-sequencing is reflected in §5 (Phase 1 split into 1a/1b/1c). The registered-adjuster machinery is still built — behind `licensedMode` so it ships inert — but it follows the revenue-unblocking work rather than preceding it.

### 9.4 Effort realism

Rough engineer-weeks for a **single founder-engineer with AI assistance, no QA/DevOps**:

| Work | Weeks |
|---|---|
| Evidential audit trail (interceptor persistence, before/after diffs, append-only constraints, coverage) | 1.5–2 |
| Consent entity + NRIC/bank encryption (key management, backfill of existing plaintext, masking) | 2–3 |
| Notifications (transport, EN/BM templates, delivery log, provider abstraction) | 1.5–2 |
| SLA engine (BullMQ, Malaysian working-day calendar incl. state holidays, clocks, pause, breach escalation) | 2–3 |
| Assessment-mode router + fast-track profile | 1–1.5 |
| Report engine (entity, templates, versions, review → sign-off, PDF render) | 3–5 |
| Status guards + AuthorityLimit | 1 |
| In-scope evidence requirement sets | 0.5–1 |
| **Total** | **~13–19 weeks (3–4.5 months)** |

That is three phases of work, not one — hence the 1a/1b/1c split. Add ~30% if a second engineer must be onboarded mid-flight, and note that **compliance tests (§3.5) are part of each item's estimate, not extra.**

### 9.5 Items that need money or third parties, not code

| Item | Dependency |
|---|---|
| ISO 27001 (or equivalent) + insurer penetration tests | RM60k–170k; commercially gating for insurer onboarding |
| PI insurance, cyber cover, DPO function | Recurring compliance cost |
| In-country LLM hosting (replacing the Cloudflare-tunnel default) | Real infrastructure spend; blocks PDPA-safe AI extraction |
| SigningCloud / e-signature vendor | Contract + integration |
| WhatsApp Business API | Meta business verification + template approval |
| Sanctions/PEP screening data | Licensed data feed |
| MetMalaysia live rainfall data | Data licence or agreement |
| Merimen appointment rail | Insurer-sponsored access, uncertain |
| Senior adjuster recruitment | RM30k–70k headhunting, scarce pool |
| Minimum paid-up capital | **Unverified** — see gate G4 |

### 9.6 Go/no-go gates — validate before the engineering that depends on them

| Gate | Question | Blocks | How |
|---|---|---|---|
| **G1** | Actual per-case non-motor fee scales on insurer panels | Any revenue model; billing design | 5–10 primary interviews (claims heads, ex-adjusting-firm staff) |
| **G2** | Which channel will MSIG use to send appointments (Merimen / email / portal)? | `Assignment` design, Phase 5 integration | Ask MSIG directly — cheapest gate on the list |
| **G3** | **Is desktop travel-claim adjudication itself "adjusting business" under FSA s.2(1)?** | The entire Path C economics — if yes, it inherits the registered cost base | Formal legal opinion (RM20k–40k) |
| **G4** | Minimum paid-up capital for adjusting business (Schedule 2 of the Registered Businesses Order) | Funding requirement | Confirm with BNM / counsel |
| **G5** | Does SST (8%) apply to adjusting / claims-administration fees? | Pricing and cash flow | Tax adviser |
| **G6** | Travel/Group PA annual claim counts and insurers' internal cost-per-claim | Path C volume thesis | Discovery with travel insurers |
| **G7** | Realistic cases-per-adjuster-per-month with AI assistance | The productivity claim underpinning margins | Time-and-motion during pilot |
| **G8** | Is a registered adjuster a **"reporting institution" under the AMLA First Schedule**? | Whether STR/CDD obligations attach to the firm directly or only to the insurer — sets the Phase 5 AMLA scope | Counsel; ask alongside G3/G4 |
| **G9** | Will the insurer supply a **policy data file feed** (SFTP or agreed inbox schema), and can it carry travel dates / flight details? | Phase 2 ingestion design; and it is the hard prerequisite for proactive flight-delay detection | Ask MSIG with G2 — same conversation |
| **G10** | Would any Malaysian insurer actually **buy a catastrophe surge-capacity licence**? | The Phase 6 surge product. Research calls it the most promising non-linear revenue structure **and** found no evidence any insurer buys one today; it also needs a standby contractor pool, which is a real cost | Discovery with 3–5 insurers' claims/CAT teams before building |
| **G11** | Are there **volume commitments** from concentrated travel/PA buyers? | Scaling the Path C automation. At RM8–12/claim, thin pricing against a handful of buyers means a lost contract removes most of the ARR | Contract minimum volumes before headcount or heavy build |

**Sequencing rule:** G2, G3 and G9 before Phase 2 (they determine `Assignment`, whether the travel line is regulated, and whether ingestion is a feed or manual). G1, G4, G5 before any investor financial model or fee-note build. G6, G7, G11 before scaling headcount or heavy Path C build. G8 before the Phase 5 AMLA build. G10 before any Phase 6 surge-capacity work.

**Cheapest gates first:** G2, G9 and the file-feed request are one conversation with MSIG and cost nothing. G3, G4, G8 are one counsel engagement. Do both before writing Phase 2 code.

### 9.7 Honest verdict

- **Feasible as a compliance-grade platform** — every BNM requirement in §3 is implementable, and the codebase already has the harder parts (multi-tenancy, document AI, video, fraud plugin architecture).
- **Feasible as a business only with either** ~RM900k–1.4M to fund the registered route through a 15–22 month breakeven, **or** a deliberate decision to run unregistered travel/PA + TPA administration first (RM300k–500k) and register later once revenue supports the payroll.
- **The riskiest assumptions are commercial, not technical:** unverified fee scales (G1), the travel-adjudication legal question (G3), and 6–12 month panel procurement. Engineering should not outrun them.
- **Not venture-scale in Malaysia alone.** RM13–18M revenue at maturity (base case) on a 15–25% EBITDA margin. A larger outcome needs regional expansion, selling the platform *to* the industry, or the motor pool this scope deliberately excludes — and that is a strategy decision, not a system-design one.

---

*Plan provenance: (round 1) functional codebase audit; (round 2) per-requirement compliance verification audit with file:line evidence; (round 3) cross-check that corrected the matrix, added fit-and-proper coverage and promoted urgent findings to Phase 0; (round 4) scope correction — motor, Individual PA and Medical & Health excluded, travel confirmed in scope via the PA class, FSA s.121 applicability made precise, §3.7 added; (round 5) feasibility check against the market research economics, phase re-sequencing and go/no-go gates (§9). Regulatory sources: FSA 2013 and BNM/RH/PD 032-29 (user-supplied PDFs, read directly), BNM/RH/PD 029-69 CSP PD (fetched from BNM), `docs/MARKET_RESEARCH_TPA_REVENUE.md` for market and cost data. (Round 6) TPA-first trajectory recorded, Path B kept open, COGS ceiling added, gates G10–G11. §8 progress record is maintained continuously as work ships.*
