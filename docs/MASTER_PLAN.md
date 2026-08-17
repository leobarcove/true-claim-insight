# MASTER PLAN — True Claim Insight as the Operating System of a Malaysian Non-Motor Loss Adjusting Firm

## Context

The operator runs an unlicensed TPA (claims administration for insurers; MSIG verbally agreed as first client, white-label, multi-panel ambition) and intends to become a **BNM-registered adjuster** under the Financial Services Act 2013. The two governing documents — the FSA 2013 and BNM's *Registration Procedures and Requirements on Professionalism of Adjusters* (BNM/RH/PD 032-29, 29 Aug 2025) — plus the Claims Settlement Practices PD (CSP, BNM/RH/PD 029-69) define the obligations this system must embody. Compliance is non-negotiable: every binding requirement must map to an enforced system control.

This plan was produced from: (1) a full codebase audit, (2) paragraph-level extraction of the regulatory documents, (3) the CSP timeline anchors, (4) market research on Malaysian adjusting practice, and (5) the economics in `docs/MARKET_RESEARCH_TPA_REVENUE.md`, which governs the sequencing in §5 and the feasibility position in §9. A per-requirement compliance verification audit produced the verdict column in §3.

> **Cross-reference note.** Section numbers cited as "research §n" refer to `MARKET_RESEARCH_TPA_REVENUE.md` as at Rev 8, 10 August 2026 (§5 revenue paths, §6 cost/P&L, §7 verdict, §8 risk register, §9 partner ask, §10 unverified items — numbering re-verified at Rev 8). That document is actively revised — if its numbering shifts again, the figures used here (funding RM900k–1.4M vs RM300–500k, breakeven months 15–22, RM9.5M base obtainable share at maturity — RM5M downside / RM14M upside — RM8–12/claim Path C pricing) are the load-bearing values to re-verify, not the section labels. *(Exactly this happened once already: this note carried "RM13–18M base steady state" until the 10 Aug 2026 re-verification found the research now says RM9.5M base — the numbering had held, the figure had not.)*

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
                                                                                                   (≤14 wkg days from complete docs, CSP 10.13 non-motor)
                                        18. ITO decides ≤7 wkg days
                                        19. Offer + discharge voucher
20. Accepts/signs ◄─────────────────────
                                        21. Payment ≤14 wkg days (non-motor)
                                                                                                                                              22. Fee note to ITO
                                                                                                                                              23. Fee settlement (CSP 11.16–11.18)
```

Supplementary claims: 5 working days (CSP). Steps 6, 13, 17 are firm-side SLA clocks; steps 3, 18, 21 are insurer-side clocks the firm monitors for MI/escalation.

### 2.2 Step → module map (existing vs planned)

> **Dated snapshot — the 30 July 2026 baseline, kept deliberately.** The
> "Existing" column describes the codebase as this plan was written; §8 records
> what has shipped since (reports, billing, the SLA engine, the router,
> notifications and more are now built). Read this table for what the plan
> started from, never for what exists today — the 10 Aug audit found readers
> doing exactly that.

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

**Closed 6 Aug 2026 — the opening decision can now attend a loss.**
`resolveAssessmentMode()` previously returned `EXPERT_REFERRAL` for medical,
`DESK_REVIEW` on the fast track and `VIDEO` for everything else, so no *opening*
decision ever chose `SITE_VISIT` — a RM300,000 fire was assessed over a video
call. (Escalation always reached it: `escalateMode` walks the ladder and
`VIDEO → SITE_VISIT` was live throughout. An earlier draft of this note said no
code path emitted it, which was wrong.)

The router now consults an **inspection policy** after the fast track: a claim in
a category the firm attends, at or above that category's threshold, is inspected;
everything else is interviewed. Both halves are per-tenant
(`siteVisitCategories`, `siteVisitThresholds`) and **absent by default** — the
mirror of the fast track, and for the sharper reason. The fast track governs
spending *less* than standard; this governs spending *more*, and money committed
on a firm's behalf cannot be taken back. A category listed without a threshold is
refused rather than defaulted.

Only lines with a physical risk address belong in the policy. Travel does not:
the loss happened overseas, which is what put 76 seeded travel claims on a mode
no adjuster could have carried out.

*(10 Aug 2026, audit: two corrections to this note. The fast track's
evidence-complete condition was subtype-blind, so the travel fast track never
actually fired at an opening decision — fixed the same day, see the §8 audit
entry. And the seed was the only writer of `siteVisitCategories` /
`siteVisitThresholds` — the tenant-config surface neither accepted nor
returned them. Also fixed the same day: both are now in the DTO and the read
response, so the inspection policy is an operator's decision rather than the
seed's.)*

The demo firm is configured with FIRE/FLOOD/BURGLARY/LIGHTNING/HOH at
**RM20,000** and travel fast-tracked to **RM5,000**. Both are business decisions
recorded in the seed, not properties of the platform — RM20,000 sends an adjuster
to essentially every fire (the band opens at RM25,000) and to the larger floods
and burglaries, while small contents losses stay on video. Set them per insurer
panel against the fee scale; §2.5 is the constraint they answer to.

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

Verdicts from the formal per-requirement codebase audit (verified by spot-check): **PASS** (implemented + enforced server-side) / **PARTIAL** (exists but unenforced/incomplete) / **FAIL** (absent). **Current: 20 PASS, 10 PARTIAL, 1 FAIL** (recounted from the rows 10 August 2026 — this headline had sat at 19/11/1 since 31 July while the retention row below moved to PASS, exactly the drift the next sentence warns about; first audit 0/7/20 against a smaller matrix, then 1/7/23). Counted from the rows below, never carried forward by hand — a summary that drifts from its own rows is the false comfort of §3.6. A row reaches PASS only with server-side enforcement *and* a CI test asserting the control; the re-audit found the CI job ran only case-service, so the gateway and crypto suites supported no verdict until that was fixed. The more serious finding is *false comfort*: schema columns, UI badges and docs assert compliance states no code produces (see §3.6). Each row should eventually link to a demonstrable screen or record.

### 3.1 BNM Adjuster PD (binding "S" paragraphs)

| Ref | Requirement | Current | Target control | Phase |
|---|---|---|---|---|
| 8.1/13.1 | Registration lifecycle; notify BNM ≤7 wkg days of capital/office/director/CEO/shareholder changes | **PARTIAL** — the 13.1 half is machinery-complete and runs inert as a TPA, exactly per the licence-flip thesis: `BnmNotification` register with due dates at occurredAt + **7 working days** (KL calendar), director/CEO/shareholder rows **drafted automatically** from KeyPerson appointments and cessations (the change that triggers 13.1(d) *is* a KeyPerson event — a separate manual step would be a second chance to forget), capital/office changes by hand, the notified act requiring the submission reference, and late notifications recorded as late. Verified live: appointment on Tue 28 Jul auto-drafted a row due Wed 6 Aug. Remains PARTIAL: the obligation binds only on registration, and the 8.1 registration-lifecycle half (the application itself) is genuinely future | Registration application pack | 5 |
| 10.1/10.2 | Fit & proper records for shareholders/KRPs | **PASS** — `KeyPerson` register (with appointment/cessation dates — the future PD 13.1 notification triggers) + `FitProperAttestation` against the criteria **as data**: the four 10.1 criteria for everyone, the six 10.2 criteria added for KRPs, transcribed from the paragraphs and pinned by test. **Silence is not attestation**: an attestation must answer every applicable criterion, and a shareholder's four answers cannot satisfy a KRP's ten. A NOT_MET is recorded, not blocked — the honest finding is the point — but requires the finding described, flips standing to **NOT_FIT**, and raises a **CRITICAL** event onto the Board register. Standing distinguishes FIT / DUE (the annual cycle is the firm's own policy choice, not attributed to the paragraph) / NOT_FIT / NEVER_ATTESTED. Verified live end to end. **Tests:** 12, in CI | Supporting-document slots per attestation remain to add | done |
| 10.3, 12.1(d) | COI: staff/family ties to insurers/workshops; per-claim screening | **PASS** — `ConflictDeclaration` (party, interest type, whose interest — the PD reaches spouses, children, parents and siblings — with tenant-id linkage for automatic matching) plus the per-claim `ConflictAttestation`. The screen runs on **every** assignment and a matched, unresolved declaration **blocks in every mode**, not only registered: the licence flip governs gaps the firm might not know about, and this is a conflict it has on record. Declarations are never deleted — resolved by a named person with a mandatory reason, because "we knew and dealt with it" is the record that protects the firm. The screen outcome is audited either way, so *clear* is distinguishable from *never screened*. Registered mode additionally requires the author's clear attestation before a report can be submitted. Verified live: declare → block naming the relationship and party → resolve with reason → permitted. **Tests:** 9, in CI | Annual re-attestation cycle sits with fit & proper (10.1/10.2) | done |
| 11.2(a) | End-to-end adjusting process embodied until report completion | **PASS** — the adjusting process is embodied end to end: insurer appointment received and acknowledged → claim opened → adjuster assigned → documents → assessment → report drafted, signed and issued. `Assignment` closed the missing front end; verified live through both halves. **Tests:** 13 (assignment lifecycle) + the report suites | The claim-journey spine itself (§2) + report engine | 1–2 |
| 11.2(b) | Rotation of assignments + work-quality reviews | **PASS** — both named controls. **Rotation** is monitored, never blocked: an unbroken streak of 3+ assignments for one insurer puts an advisory on the assignment audit row — a hard rule would regularly force the *less* qualified adjuster onto a claim, which 12.2(b) forbids from the other direction. Assigning someone new produces no advisory, since that is what rotation wants. **Work-quality reviews** attach to *issued* reports only (the review judges what the insurer received), the author cannot review themselves, and a below-SATISFACTORY rating requires findings — these rows are the evidence behind `performanceSatisfactory` in senior recognition (12.4(b)(ii)). **Tests:** 5 rotation + service gates, in CI | Sampling policy (which reports get reviewed) is the firm's to set | done |
| 11.2(d) | Escalation processes to Board | **PASS** — `ComplianceEvent` register with two automatic raisers wired where the controls already are: a **firm-side** SLA breach reaching escalation level 3 (insurer-side `monitorOnly` breaches never reach the firm's own Board — that would misstate whose breach it is), and an adjuster attesting a conflict on an assigned claim. System raising is **idempotent by fact** (`dedupeKey`): two sweeps observing the same breach raised one event, verified live. Acknowledge/resolve are acts by named people, resolution requires a note ("how it was dealt with" is what the Board reads), and the **Board report stamps** `boardReportedAt` on every included event — "was the Board told" has a date for an answer. Manual raising for policy breaches and audit gaps. **Tests:** 7, in CI | Restraint is the design: a feed that escalates everything is a feed the Board stops reading | done |
| 11.2(e) | Pre-employment background screening | **PASS** — `BackgroundScreening` with the paragraph's own minimum as data: bankruptcy/insolvency, employment history, academic history, criminal screening — `OTHER` never substitutes. Three honesty rules: a check performed **after** employment began still counts but is flagged `late` (the assurance exists; "prior to employment" it was not); **FINDINGS is a legitimate outcome** — "we found it, considered it and proceeded" is the protective record — but an undescribed finding is refused; and standing joins the assignment advisories (TPA: recorded; registered: blocks). Verified live incl. the late flag and the FINDINGS-without-note refusal. **Tests:** 9, in CI | Screening for KRPs/shareholders sits with fit & proper (10.1/10.2) | done |
| 12.1(a),(b), 12.2(a) | Adjusting work only by full-time qualified adjusting employees | **PARTIAL** — `licenseVerifiedAt` is live: written only by an audited verification act (`POST /adjusters/:id/verify-licence`, named actor), and registered-mode assignment refuses when it is unset. Report authorship was already restricted to adjusting employees structurally. The employment-type field is now live: recorded by an audited act, and anything other than FULL_TIME is an assignment advisory as a TPA and blocks when registered (verified live: PART_TIME produced the 12.1(a) advisory on the audit row). `qualification` captures Schedule 2 as held. Remains PARTIAL only for Schedule 2's transcription into checkable data | Transcribe the Order's Schedule 2 | 3 |
| 12.2(b) | Assignment commensurate with skills/qualifications/experience | **PARTIAL** — `AdjusterCompetency` (per category: years, cases handled, performance) now gates assignment. A SUSPENDED adjuster is refused in **every** mode; a missing category competency or unverified licence **blocks in registered mode** and is a recorded advisory on the assignment audit row as a TPA — the licence flip applied to people, verified live both ways. Remains PARTIAL: competency depth (level vs claim complexity) and rotation (11.2(b)) are not yet weighed | Rotation counters; QA sampling | 3 |
| 12.3/12.4 | 12.3: *new* adjusting employees closely supervised by a senior for ≥1 year before independent work. 12.4: senior recognition = ≥5 years in the subject matter plus case volume/quality. (The <5-years *report countersign* is 12.7(b), not here) | **PASS** — both are now data-driven and enforced. **12.3:** `Adjuster.adjustingSince` derives the supervision window; an author inside it needs a senior countersign *whatever their prior experience* (a ten-year veteran newly hired is still 12.3-new — the firm has not seen their work), and an unknown start date reads as under supervision. **12.4:** senior is a *recognition act* by a named person, refused below the five-year floor, refused without recorded cases (12.4(b)(i)) or attested performance (12.4(b)(ii)), auto-revoked if years fall below the floor, and five unrecognised years do **not** make a countersigner senior. Verified live: recognition below the floor refused with the 12.4(a) citation. **Tests:** 28 across the competency and countersign suites, in CI | Rotation + QA reviews are 11.2(b), tracked separately | done |
| 12.5 | Turnaround per internal policy honouring CSP | **PARTIAL** (vestigial) — `slaDeadline` one passthrough write, zero reads; **no scheduler in the entire monorepo** | `SlaPolicy` + `SlaClock` per stage; breach escalation | 1 |
| 12.6 | Report discloses facts, assumptions, methods, sources, databases | **PASS** — the four disclosure sections are mandatory on every report type and enforced at *both* submit and sign, server-side; whitespace does not satisfy them. Held in a code registry, not a table, so they cannot be switched off with an UPDATE. The rendered PDF prints each section with the paragraph it satisfies and discloses AI-assisted sections. **Tests:** 13, in CI | `AdjusterReport` mandatory Methodology/Sources/Assumptions sections; AI-derived content flagged | 1 |
| 12.7 | Reports authored by adjusting employees only; junior reports senior-signed | **PASS** — authorship enforced structurally (author and signer are `Adjuster`, not `User`; a FIRM_ADMIN without an adjuster profile is refused — verified live), and the countersign now keys off **real** standing: subject-matter years from `AdjusterCompetency`, PD 12.4 *recognition* as the senior test (five unrecognised years do not make a countersigner), and the PD 12.3 supervision window overriding experience. Blocks in registered mode, recorded as a TPA, with the basis persisted on every report. This row lagged the competency build — caught by re-audit, not by memory. **Tests:** 20 across the authority suites, in CI | — | done |
| 12.8 | Records ≥7 years incl. photos, police/bomba reports, statements | **PARTIAL** — "delete" is now a soft delete everywhere a user can reach (documents in case-service, recordings in video-service); rows and files are retained. Destruction is confined to a scheduled retention sweep behind `canPurge`: claim closed + 7 years elapsed + no legal hold, with the seven-year floor enforced by a database CHECK constraint as well as in code, and every purge audited *before* the destruction. Legal holds (place/lift, reason mandatory, audited) suspend purging outright. Verified live: sweep purged an entitled document, kept a held one, refused everything else. Remains PARTIAL: retention covers documents and recordings, not yet the claim rows, cases or analysis records themselves | `RetentionPolicy` engine (7-yr floor, legal hold); soft-delete everywhere; storage lifecycle | 2 |
| 12.9–12.11 | Training; CPD 15 hrs/yr; programmes per the **Association of Malaysian Loss Adjusters** (12.11 — that AMLA is the association, not the Anti-Money Laundering Act; §3.4 and gate G8 use the Act. `Adjuster.amlaMember` means the association) | **PASS** — `CpdRecord` ledger with the 12.10 floor live: only **recognised-provider** hours count toward the fifteen (12.11), unrecognised attendance is recorded but is not the currency; an entry must be completed in the year it counts toward; a DB constraint bounds hours per entry. Standing distinguishes an **open year** (MET / ON_TRACK / BEHIND against pro-rata) from a **closed** one (SHORTFALL) — February is never fourteen hours "in breach", or the dashboard cries wolf all spring. Firm-wide dashboard for admin/compliance. Verified live incl. the year-mismatch refusal and the DB bound. **Tests:** 10, in CI | Training *adequacy* (12.9) remains the firm's qualitative act, evidenced by this ledger | done |

### 3.2 CSP timeline anchors (binding on adjusters)

| Anchor | Current | Target control | Phase |
|---|---|---|---|
| Firm ack of appointment ≤1 wkg day | **PARTIAL** — `Assignment` records the instruction and starts the clock from *when it arrived*, not when work began; acknowledging or declining stops it, since both answer the insurer. Verified live: received Fri 31 Jul → due Mon 3 Aug, and a claim cannot be opened on an unacknowledged appointment. The acknowledgement has been **sent** since the notification layer landed 5 Aug (`assignment.acknowledged` template, delivery-logged) — this row's earlier "recorded, not sent" reason was stale by five days when the 10 Aug audit caught it. Remains PARTIAL only until the send path is verified live, per the rule that built is not the same as operating | `SlaClock` ACK_TO_ITO + auto-ack template | 1 |
| Preliminary report ~7–14 days (market practice) | **PASS** — `SlaClock` starts on adjuster assignment (7 working days, per-insurer override, KL calendar) and is stopped by the act CSP measures: issuing the PRELIMINARY report through the report engine. Pauses on awaiting-documents and SIU referral bank the remaining days. Operating on real dates since the 2026 calendar was installed — verified live: assignment Fri 31 Jul → due Tue 11 Aug | 2027 calendar when gazetted | done |
| Final report ≤14 wkg days from complete documents (CSP 10.13, non-motor) | **PASS** — the clock now anchors where CSP puts it: `documentsCompleteAt`, stamped when the last mandatory checklist item is uploaded (set-once — a later upload cannot move the anchor, a deletion cannot unset the fact), starting the fourteen-working-day clock from that moment. Verified live: the completing upload stamped the anchor and started the clock, 31 Jul → due 14 Aug. `REPORT_PENDING` remains an idempotent fallback start for claims with no checklist. Moving to REPORT_PENDING with mandatory evidence missing blocks in registered mode and is recorded as a TPA — §3.6 #8 closes with this | 2027 calendar when gazetted | done |
| Supplementary claims 5 wkg days | **PASS** — no longer structurally precluded: `POST /claims/:id/supplementary` reopens a CLOSED claim (the one legal exit, reflected in the state machine so it tells the truth), starts the **5-working-day** `SUPPLEMENTARY_CLAIM` clock, requires the supplementary described, clears `closedAt` (retention re-anchors on the next closure), and works under a legal hold — the hold protects records, not work. Verified live: reopen Fri 31 Jul → due Fri 7 Aug; refused on a non-CLOSED claim. The response itself is the report engine's SUPPLEMENTARY type, which already stops this clock on issue | — | done |
| ITO decision ≤7 days / payment ≤14 days (monitor) | **PARTIAL** — `INSURER_PAYMENT` runs as `monitorOnly` and `GET /sla/insurer-mi` now reports each panel insurer's met/breached/running counts per stage — the evidence that a delay originated with the insurer, verified live. `INSURER_DECISION` remains defined but unreachable (starts at `UNDER_REVIEW`, which the claim state machine has no route to) | Close the lifecycle gap | 2 |
| Fee settlement by ITO (CSP 11.16–11.18) | **PASS** — the billing foundation, client-agnostic per §6.8: `FeeScale` per insurer (SCALE with **progressive** bands like a tax schedule — a flat-on-total reading would make fees jump at band edges — plus TIME and FIXED; SST as a configurable rate, applied to the professional fee only, never to disbursements, which are reimbursements), `TimeEntry`, `Disbursement`, and a `FeeNote` that stores its own **derivation** — the number without its working is unanswerable in a dispute. Draft only after the claim is decided; issued notes immutable; paid requires the payment reference; the per-insurer statement ages outstanding notes (CURRENT/1–30/31–60/61–90/90+) — the CSP 11.16–11.18 evidence. Verified live: RM 25,000 → 1,750.00 + 140.00 SST + 85.50 disbursement = 1,975.50, due +30 days. MSIG's actual terms arrive as a row, not a release. **Tests:** 10, in CI | Rates await each insurer's real terms | done |
| Records readily available (audit-readiness) | **PASS** — `audit_trail` is append-only by database trigger (UPDATE never permitted; DELETE only under an explicit maintenance flag, verified). The interceptor persists rather than carrying a TODO and never reads request bodies. Coverage across gateway, case-service and video-service through one shared writer; refusals recorded via the exception filter — the only place that sees guard rejections. **Tests:** 24, in CI | — (bespoke writers migrated 31 July; the export seal stays direct and fail-closed by design) | done |

Working-day arithmetic requires a Malaysian holiday calendar (national + state) — part of the SLA engine (Ph 1).

### 3.3 FSA 2013 constraints

| Ref | Constraint | Current | Target control | Phase |
|---|---|---|---|---|
| s.123/124 + Sch 7 | No misleading/deceptive claimant-facing statements incl. AI outputs. **Applicability:** s.121 defines "financial service provider" as an *authorized* or *registered* person, so these duties attach **on registration**. Unregistered today, the operator is bound instead by (a) its contract with the insurer, which flows down the insurer's own Sch 7 duties, (b) the CSP PD via the insurer, and (c) general consumer-protection and misrepresentation law. Practically the same bar; state it accurately rather than overstating present direct exposure | **PARTIAL** — deception and fraud data no longer reach claimants (fixed in Phase 0, asserted by 8 tests); the adjuster report states in terms that the settlement decision rests with the insurer; AI contribution is disclosed per section rather than downplayed (§6). Still absent: versioned, compliance-approved claimant-facing templates | Versioned, compliance-approved templates; LLM output never verbatim to claimants | 0 (redaction, done) / 1 (template flag) / 5 (formal approval) |
| s.143 | Produce documents/information to BNM in specified form | **PASS** — two forms on demand, compliance roles only, both audited at the gateway. `GET /claims/:id/export`: the complete machine-readable file (claim, claimant with NRIC decrypted, appointment, documents incl. soft-deleted, reports, SLA history, consents, transfer records, audit trail, sessions, notes); completeness is data (`BUNDLE_SECTIONS`) and a partial assembly refuses. `…/export/archive`: a ZIP an examiner walks away with — the sealed bundle plus the document binaries and rendered report PDFs, soft-deleted documents visibly separated, any unfetchable binary declared in MISSING_FILES.txt and on the audit row, never silent. Every export writes a **sha256-sealed** row to the append-only trail, and the seal is **fail-closed**: an export that cannot be recorded is refused, because an unprovable production to the regulator is worse than a delayed one. **Tests:** 15, in CI | The "specified form" is ultimately BNM's at request time; both forms exist to meet it | done |
| s.146 | No-notice examination — audit-ready always | **PASS** — see the audit row above. An examiner arriving unannounced can be shown who did what, who accessed which personal data, which requests were refused, and that no row can have been altered after the fact | Append-only evidential audit trail + this matrix as live dashboard | 1 |
| s.139 | "Insurance" naming restriction | **PARTIAL** — brand clean, but the claimant-web `<title>` says "Insurance Claims Made Easy"; the 10 Aug audit corrected this row (the PWA manifest is clean — "True Claim Insight") and widened it (the claimant welcome page carries "Assessments Made Simple" and two further taglines); refer to counsel | Policy note + legal review of taglines | 0 |
| s.240 | Director personal liability | — | Motivates ComplianceEvent/Board register | 3 |

### 3.4 PDPA 2010 + AMLA

| Requirement | Current | Target control | Phase |
|---|---|---|---|
| Consent (lawful basis, withdrawal) | **PASS** — machinery and wording both operative. v1 notices approved 31 July 2026 at the principal's direction, recorded under the firm-admin identity, following an AI-assisted substantive review against PDPA s.7, the 2024 Amendment and the CBPDT Guidelines. The review found and fixed two real defects: no contact particulars anywhere ("contact us" without a route fails s.7's substance — every notice now names the route and the Commissioner as the complaint avenue, in both languages), and the cross-border notice pointing at a privacy notice that did not exist — it now names each offshore recipient and country directly. Verified live: consent granted on approved wording, the biometric gate answering true, a second approval refused (approved wording is immutable; revisions ship as v2). **Independent Malaysian counsel review remains the standing recommendation**; counsel's changes would ship as v2, leaving v1 consents provably tied to v1 wording. **Tests:** 12, in CI | Counsel review → v2 if required | done |
| NRIC/bank-detail protection | **PASS** — NRIC and bank account number encrypted at rest (AES-256-GCM envelope, versioned ciphertext); plaintext columns dropped, not merely shadowed; lookup via HMAC blind index; ciphertext and index omitted from query results by default so they cannot reach a browser; full value only through an audited firm-admin reveal. NRIC removed from logs; `verify-nric` throttled with non-enumerating errors. **Tests:** 15 crypto (incl. a simulated KMS custody migration) + a schema-reading omit-coverage test. **Qualified for messaging channels (6 Aug 2026):** the guarantee is end-to-end only where we control the transport. A claimant answering `bank-account-number` on Telegram (or, later, WhatsApp/Messenger) types the plaintext into the platform's own message history, where it persists offshore, outside our retention sweep and outside the claimant anonymisation job. Our column is still encrypted and the answer bag still masked — but the copy we do not hold is beyond both. This is a **decided position, not an oversight**: collecting payout details in-channel was chosen over a secure hand-off link for UX. `ChannelCapabilities.retainsPlaintext` records which channels carry the exposure. Revisit if a channel is used at volume, or if counsel reads s.129 as reaching it | Rotation drill and KMS custody transfer remain operational tasks; re-examine in-channel payout collection before the first non-pilot volume | done |
| Retention/deletion | **PASS** — soft delete, scheduled document purge and legal hold, plus **claimant anonymisation** (6 Aug 2026): a nightly gateway sweep irreversibly destroys identity once every claim naming a person is closed and past the PD 12.8 floor, while the claim record survives. Replacements are random, never derived — a reversible transform is pseudonymisation and PDPA still applies to it. **Tests:** 15 | Purge of remaining non-document records as those contexts gain owners | done |
| Cross-border transfer (Gemini/Hume/Daily.co/Supabase/Nominatim/Telegram) | **PARTIAL** — the biometric path (the sensitive-data one) is now consent-gated and fails closed, and a s.129 **transfer register** exists: every Hume, Gemini and Daily.co call writes a `TransferRecord` naming recipient, country, data description, purpose and basis. The register is honest — the gated biometric path records `CONSENT s.129(3)(a)`; the ungated Gemini/Daily paths record **no basis**, because none is established. **Two paths added 6 Aug 2026, both recorded honestly rather than quietly.** Telegram carries claimant message content offshore for every conversational turn, and is *retentive* — what a claimant types stays in Meta's or Telegram's history, outside the retention sweep and the anonymisation job (see the payout-details qualification on the row above). And Gemini now receives free text a claimant typed, when deterministic parsing of an answer fails; that call writes a `TransferRecord` with an explicit data description for conversational text and `lawfulBasis: null`, because none is established. Neither is a new *kind* of gap — both are the same ungated-offshore gap this row already reports, now with two more paths in it. Remaining: gate those paths (consent or local-LLM default), Supabase/Nominatim recording, the in-country LLM path itself, and counsel on FSA 2013 secrecy over model inputs (§6.18). **Widened, then narrowed, 10 Aug 2026 (audit):** the gateway's OCR module was posting claim document images to a *hardcoded* third-party webhook with no registry entry and no `TransferRecord`, and Telegram was absent from `OFFSHORE_PROVIDERS` entirely — its omission locked in by the registry's own pinning test. Fixed the same day: the OCR endpoint is env-configured and **off by default** (enabling it is a transfer decision, not a config convenience), and both providers are now registered and recordable, the pinning test updated with them. Still open: nothing yet *writes* a Telegram or OCR transfer record — `transferRecord` belongs to the assessment context, so those writes need an ownership-respecting home before either path carries more than synthetic data | Local LLM default for PII docs (real infrastructure, not tunnel); per-tenant provider policy; transfer register | 2 |
| AMLA/CTF screening | **FAIL** — no screening/CDD/STR concepts; `KycStatus` writer has zero callers, nothing gates on it | Sanctions/PEP screening plugin at claimant/payee registration; suspicious-matter → ComplianceEvent | 5 |

### 3.6 False-comfort findings (fix the assertions, not just the gaps)

The audit's most dangerous items are places where the system *claims* a control that does not run. Status as at the final 31 July 2026 audit — **10 of 10 closed** (two closed by making the assertion honest rather than by building what it falsely claimed):

| # | Finding | Status |
|---|---|---|
| 1 | Global `AuditLogInterceptor` registered app-wide but persists nothing | ✅ **closed** — writes rows; and the deeper gap it hid (guards run before interceptors, so refusals reached it at all) is closed via the exception filter |
| 2 | `AuditTrail.oldValues/newValues` never populated — pre-image fetched then discarded | ✅ **closed** — field-scoped diff, pre-image captured before the write |
| 3 | `nricHash`/`nricEncrypted` imply encryption that never runs; plaintext NRIC live and logged | ✅ **closed** — encryption real, plaintext columns dropped, NRIC out of logs, ciphertext omitted from responses by default |
| 4 | "PDPA Consented" badge asserted by frontend hardcode | ✅ **closed** — the badge now reads real consent records; the flag is no longer client-settable. The column persists until the retention work drops it |
| 5 | `redactClaim` masks less than it appears; absent from the Cases module | ✅ **closed** — coverage extended and fail-closed, asserted by 8 tests |
| 6 | Adjuster credential fields with zero enforcement | ✅ **closed** — `licenseVerifiedAt` is written only by an audited verification act and gates registered-mode assignment; competency and seniority are live data driving the countersign. (`bcillaCertified`/`amlaMember` remain descriptive fields with no PD paragraph demanding enforcement — recorded as such rather than left implying otherwise) |
| 7 | `slaDeadline` column implies turnaround tracking; nothing evaluates it | ✅ **closed** — real `SlaClock` with a sweep that marks breaches; the dead column should be dropped |
| 8 | Evidence checklist UI implies gating ("3 of 5 documents") that doesn't exist | ✅ **closed** — completeness now does two real things: stamps `documentsCompleteAt` and starts the CSP final-report clock when the last mandatory item arrives, and gates the move to REPORT_PENDING (registered blocks, TPA records) |
| 9 | Signature completion endpoint forgeable (stub provider, no role restriction) | ✅ **closed** in Phase 0 — restricted to firm admins; the provider is still a stub |
| 10 | `validationStatus` populated by a stub that always returns SKIPPED | ✅ **closed as honest** — re-examined at the final audit: the stub is labelled NOT IMPLEMENTED in code, SKIPPED is literally true ("no validation ran"), and the value is declared in one frontend type but **rendered nowhere** — no screen presents it as validation performed. False comfort requires a false claim; there no longer is one. Real validation arrives with the eKYC/deepfake providers (not integrated) and reopens this row if its UI overstates |

The pattern worth carrying forward: every one of these was found by running the system and looking at what it actually produced, not by reading the code and reasoning about it. The NRIC that reached the audit trail through a framework error message (§8) is the same lesson learned again.

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
3. **Compliance tests in CI**: automated tests assert each control ("junior cannot finalise report", "audit row written on every claim mutation", "SLA breach fires escalation"); the suite is demonstrable evidence in a s.146 examination. ✅ **This mechanism exists** — `.github/workflows/ci.yml` runs a typecheck job and a compliance job, and `pnpm test` covers every package. **509 tests across 39 suites in case-service alone**, 590 tests across 45 suites repo-wide (case-service and gateway/crypto run live, recounted 10 Aug 2026, not carried forward by hand). A coverage caveat the 10 Aug audit recorded: only three packages carry tests (case-service, api-gateway, crypto) — risk-engine and video-service run `--passWithNoTests`, and **risk-analyzer has no tests of any kind**, so nothing in CI verifies the Python service. The suites are pure functions, so CI needs no database. The A4 finding that this paragraph once carried is closed. What remains is coverage, not existence: each matrix row should name the test that asserts it, so a PASS points at an executable proof rather than at this list.
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
| `Claim` | Add assignmentId, assessmentMode, `documentsCompleteAt` (starts the final-report clock — **14** working days non-motor per CSP 10.13; this cell said 10, the motor figure, until 10 Aug 2026), reserve amount; server-side status transition guards (adopt the Cases transition-table pattern). *Shipped note: the Assignment link landed as a relation held on the Assignment side, not an `assignmentId` column* |
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
| **A3** | ✅ **CLOSED** (31 July 2026). Was: no segregation of duties — the 20-permission × 8-role matrix in `adjuster-portal/src/lib/permissions.ts` is frontend-only, and a plain `ADJUSTER` token moved a claim to `APPROVED` through the API with no authority check | Re-verified live: the assigned adjuster is now refused `APPROVED` and still permitted `SCHEDULED`; a firm admin who did not assess it approves, with `FIRM_ADMIN authorised for APPROVED (ceiling 50000)` written to the audit row | `AuthorityLimit` + server-side checks in `ClaimsService`, not the controller — a role decorator cannot know whether this person assessed this claim. An absent limit means no authority, not unlimited. **18 tests** |

#### Material

| # | Defect | Note |
|---|---|---|
| **A4** | ~~**Zero tests, no CI**~~ — **closed 31 Jul 2026** | *As found:* not one test file existed (only third-party ones inside the Python venv); four services declared `"test": "jest"` with nothing to run; no `.github/workflows`. Critical because §3.5 makes "compliance tests in CI" the *entire* mechanism for evidencing controls under FSA s.146. *Now:* `.github/workflows/ci.yml` runs typecheck + compliance jobs and `pnpm test` covers every package — **282 tests across 26 suites** in case-service, 28 spec files repo-wide (recounted 5 Aug 2026). What remains is coverage per matrix row, not the mechanism |
| **A5** | **No *production* deployment artefacts** | *Partially closed 31 Jul 2026:* `deploy/staging/` now carries a full staging stack (multi-target Dockerfile, Compose, Caddy edge, secrets bootstrap) for one EC2 instance in ap-southeast-5 — verified by running it locally. Still open for production: no Kubernetes/Terraform, no DR posture, no CI deploy. Insurer vendor assessments ask for deployment, DR and network topology; the staging artefacts are the first honest answer, not the whole one. The network policy mitigating A1 would live here |
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
| `platform` | api-gateway **and** case-service — the two keyholders (standing decision 4) | encryptionKey |

*(The `platform` row was missing from this table until the 10 Aug 2026 audit — the code had declared five contexts while the plan described four.)*

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
- SLA engine: BullMQ on existing Redis, Malaysian working-day calendar (national + state holidays), clocks for ACK ≤1 day / preliminary / final ≤**14** days from `documentsCompleteAt` (CSP 10.13 non-motor — this line carried the 10-day motor figure until 10 Aug 2026; the build was corrected to 14 on 6 Aug, `c5b2127`), pause-on-awaiting-documents, breach escalation — **prod**
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

1. ~~**Uncommitted travel work** on `feature/non-motor-claims-ui`, no remote — commit + push first (Phase 0 item 1).~~ *Resolved in Phase 0 (`e404fc5`): committed and pushed, and the branch has had a remote since.*
2. **Dual Case/Claim lifecycle** — keep the boundary (Case = pre-claim intake funnel; Claim = regulated engagement); adopt Case's transition-table pattern for Claim guards (Ph 1); revisit only if Assignment-without-Case proves awkward.
3. **Offshore LLM** — local (Ollama) default for PII docs from Ph 2; Gemini only under explicit per-tenant policy for non-PII. Until then: do not demo AI extraction on real claimant documents. **Widened for demo, 6 Aug 2026 — recorded, not silently assumed.** Gemini now also normalises free text a claimant types during conversational intake (`CHAT_LLM_NORMALISER_ENABLED`, off by default). That is claimant personal data, so it sits outside the "non-PII only" line above. It is bounded three ways: fallback-only, so a deterministic parse is always tried first and most turns never reach a model; the model returns a *value*, never a decision, and that value must pass the same `validateAnswer` as a typed answer; and every call writes a `TransferRecord` with `lawfulBasis: null`, because none is established. **Conditions before this faces a real claimant:** a lawful basis (consent-gate or the in-country model), counsel's view on FSA 2013 secrecy (item 15), and the AI-scope assessment (item 16). Synthetic and internal-tester data only until then.
4. **Merimen dependency** — market's appointment rail but access is insurer-sponsored/uncertain. Assignment is channel-agnostic from Ph 2 (manual/email works); Merimen is an ingestion adapter (Ph 5), never a schema assumption. **Ask MSIG early which channel they will use.**
5. **Single-firm assumption — fix it now, it is a foundations item.** *(Resolved in Phase 1a, see §8: `resolveCaseTenant` now refuses that shortcut — insurer panel nomination falls back to `HANDLING_FIRM_TENANT_ID`, and no configuration refuses intake rather than guessing. The text below stands as the reasoning of record.)* `resolveCaseTenant` previously resolved a claimant self-serve case to "the first `ADJUSTING_FIRM` tenant found". That is the one place the codebase assumes a single adjusting firm, and it is the cheapest possible moment to remove it. The rest of the platform is already genuinely multi-tenant (`Tenant` with ADJUSTING_FIRM/INSURER types, `UserTenant` m:n, tenant-scoped queries and redaction), so the fix is small: resolve the **handling firm explicitly** — from the insurer's panel configuration, the intake channel, or the `Assignment` — instead of picking one arbitrarily. **Phase 1a.** Doing this does not build a SaaS product; it merely stops foreclosing Path B (§6.14) for the sake of one convenience shortcut.
6. ~~**No queue/scheduler exists**~~ — *decided 30 July and built (see §8): BullMQ on the existing Redis under the `tci:` prefix, with the `sla`, `notifications`, `retention` and later `ingestion` queues live.* The original note stands as the reasoning: one shared worker pattern, decided first because Phases 1–2 all sit on it.
7. **Regulatory interpretation** — have the Order's registration requirements and PD applicability confirmed by counsel before the licensed-mode flip (Ph 5). The system makes the facts demonstrable; it is not the legal opinion.
8. **MSIG is verbal** — keep Phases 1–2 client-agnostic; MSIG-specific behaviour lives only in tenant config.
9. **Stub debt** (signature provider, rainfall data, doc validation) — each scheduled; nothing ships "prod" while its stub is load-bearing for that phase's exit criteria.
10. **Three disconnected risk scores** (DeceptionScore, RiskAssessment, FraudSignal) — do not merge into one opaque number (itself a Sch 7/explainability risk); Ph 4 presents all three with provenance.
11. **Portal scraping is not an available option — decided.** A proposal existed to scrape the insurer's agency portal for policy data and describe it externally as "a dedicated team reviewing policies". This plan rejects it on three independent grounds: the insurer has already stated that agents/adjusters may not log into its system, so automated access breaches the access terms and risks the Computer Crimes Act 1997; describing automation as a human team misrepresents the service to the client whose data is at stake; and either, if discovered during a vendor security assessment, ends the relationship and damages the registration application. **The sanctioned path is a structured policy file feed** (SFTP or an agreed inbox schema) — Phase 2, `PolicySource.FILE_FEED`. If the insurer declines a feed, the fallback is manual keying of the emailed data, not scraping.
12. **AI is disclosed, not downplayed — decided.** A position existed to use AI internally while minimising it externally. BNM PD **12.6** requires the adjusting report to disclose the facts, assumptions, **methods**, sources and databases behind the assessment, so AI contribution to an assessment is a disclosable method. The defensible posture is the one the system already supports: human-in-the-loop sign-off, full audit trail with before/after values, explicit methodology sections, provenance kept on each risk signal, and no automated decision on medical claims. Downplaying invites the scrutiny it is meant to avoid; documented explainability answers the regulator's actual concern (accountability), and is also what insurer vendor assessments ask for.
14. **Path B (platform sold *to* insurers and other adjusting firms) — kept open, not built.** The research values it at RM0.4M / RM2.3M / RM6–8M ARR and the §7 verdict names it one of only three routes to an outcome larger than a ~RM9.5M-at-maturity services business (base case; the research revised this down from RM13–18M). This plan does **not** build it: with a TPA-first trajectory the near-term buyer is the insurer, not a peer adjusting firm. But it must not be foreclosed by accident, which is why item 5 is a Phase 1a fix rather than an accepted constraint. Decision rule: **keep multi-firm tenancy structurally possible at near-zero cost; build Path B only against a signed pilot with a firm that is not ours.** Revisit if an incumbent (Sedgwick / McLarens / Crawford / MAC) opens a licensing conversation — the research flags that as an untested but plausible channel.
15. **Do not claim in-country AI processing until it is true.** *(Scheduled: the principal set the local-LLM work for the week of 10 Aug 2026 — recorded as a dated decision rather than an open item. Note it lands in the same week as the MSIG sessions, so unless it ships first, the residency answer in those meetings is a dated commitment, not a present fact.)* The live default is Gemini (offshore) whenever `GEMINI_API_KEY` is set, and the "sovereign" Ollama path defaults to an ephemeral Cloudflare tunnel. Until Phase 2 lands real in-country hosting, any external statement must be framed as a dated architecture commitment, not a present fact. See §3.6 item 10 and §6.3.
16. **Service-to-service trust is the largest single exposure (§4.3 A1).** Demonstrated: forged identity headers to `:3001` return real claim data, with services bound to `0.0.0.0` and no network policy. Every control in §3 — role gating, redaction, tenant isolation, audit — sits *behind* the gateway and is bypassed entirely by a direct call. Treat this as the first work item of Phase 0b, not a backlog entry. Until it is closed, do not expose any service beyond localhost and do not put real claimant data in a shared environment.
17. **"Microservices" is currently a distributed monolith (§4.3 A2).** Four services write one database with no ownership boundaries, so a schema change can silently break three services and any service can corrupt any table — while cross-service operations have no transaction. The decided response is to enforce ownership at the API boundary rather than merge services, and to **stop adding services**. If ownership enforcement proves awkward, the fallback end state is two backend services (core API + `risk-analyzer`) plus two frontends.

---

20. **Messaging-channel identity: the platform's verified contact, not a one-time code — decided 11 Aug 2026.** A claimant binds a Telegram chat to their Claimant record by tapping *Share my number*; no OTP is sent. The reasoning, because this looks weaker than it is:
    - **The code was defending the wrong path.** It was sent to the very number Telegram had already verified, so on the share-contact path it proved little beyond what the platform asserts. The path it *genuinely* protected was a **typed** number — and that path is now removed, because typing a number is exactly how one would claim to be somebody else.
    - **What actually protects the binding** is a check that did not exist: Telegram lets a user share *any* card from their address book, and the adapter was reading `phone_number` without asking whose it was. An attacker could share the victim's contact and be bound as them; the OTP was the only thing in the way, because the code went to the real owner's handset. `contact.user_id` must now equal the sender's id. **This hole was live and is closed regardless of the OTP decision.**
    - **What the binding can reach is narrow.** The bot is write-only with respect to claimant history: it opens a Case and walks a flow, and `activeCaseId` is only ever set from a Case it just created. It cannot list, read or report on anything existing. A wrongly-bound attacker can file a junk claim — which then meets policy matching, operator vetting, and the identity gate that refuses any decision on an unverified claimant — not read one.
    - **It matches the position already taken.** The identity gate deliberately leaves *intake* ungated, because "refusing a notification turns a compliance control into a barrier to reporting a claim". An OTP at the door contradicted that at an earlier point than the claim lifecycle applies.
    - **What is given up** is proof of *current* handset possession. The realistic residual is a recycled Malaysian prepaid number whose new owner binds to the previous owner's record — narrow, and caught before any decision by manual identity verification.
    - **Volume, not impersonation, is the realistic attack on an open bot**, so it gets a throughput control: 20 inbound turns per binding per minute, counted from the transcript so it survives a restart, with only the first refusal answered so the bot cannot amplify a flood.

    **The condition that reverses this, written down so it is not quietly forgotten: the day the channel serves anything *back* — claim status, a document, a payout figure — binding becomes read-sensitive and needs a stronger proof.** The intended answer is a deep link from an authenticated PWA session (`t.me/<bot>?start=<one-time-token>`), which is stronger than SMS and costs nothing per message; the code is the fallback. Deep-link binding cannot replace the code *at the door*, because it presupposes an authenticated session and would remove cold-start intake, which is the channel's whole point.

21. **Staff correction of intake answers: permitted pre-decision, attributed, never silent — decided 17 Aug 2026.** An operator asked whether the internal team is meant to be unable to edit a case's intake answers. The audit that answered it found the position was half-designed and half-accident, so this records the whole of it:

    - **After submission (SUBMITTED / UNDER_REVIEW / REFERRED_TO_EXPERT), answers are frozen for everyone — kept, deliberately.** The intake answers are the claimant's own statements: the evidence the vetting decision and any later adjuster's report rest on, and part of the record §1 says must be honest from the first claim because pre-registration records are exactly what BNM examines. A staff member rewriting a statement after it has entered vetting would corrupt that chain. The correction path from those statuses stays the state machine's one backward edge: *Request more info* → INFO_REQUESTED → amend → resubmit.
    - **In the editable statuses (DRAFT / IN_PROGRESS / INFO_REQUESTED), staff correction is legitimate and is now built.** The API always permitted it (`INTAKE_ROLES` on `PATCH /cases/:id/answers`) — the staff-capture channel depends on it — but the portal offered no way to do it, so an operator on the phone with a claimant during the info-requested loop could attach a document yet not fix a mistyped flight number. That asymmetry served nobody: the claimant could change the answer themselves in those statuses, so refusing the staff the same act protected nothing.
    - **The non-negotiable condition is attribution, and it did not exist.** `patchAnswer` writes **no audit row** — the user-flow site claimed it did, which was false comfort of exactly the §3.6 kind. For a *claimant's* own turns the conversation transcript is the attributable record, so the gap is tolerable there; for a *staff* correction there is no transcript, so an unaudited edit would be an anonymous change to a claimant's statement. Staff corrections therefore go through a **separate endpoint** that refuses claimants, writes an evidential audit row (actor, step, before and after values) and does **not** move the conversational cursor — a correction is not a turn, and rewinding `currentStepId` would re-ask the claimant everything after the corrected step.
    - **Sensitive answers are excluded.** Bank-account steps are masked at rest and their plaintext lives in encrypted columns behind the audited firm-admin reveal; an inline correction path would bypass that. Payout corrections keep their own gate.
    - **What the claimant confirms still holds.** A correction in DRAFT / IN_PROGRESS happens before the claimant's review step, which shows the current answers; in INFO_REQUESTED the resubmission review does the same. Nothing reaches vetting that the claimant has not been shown.

    **The condition that reverses this:** if registered-adjuster mode ever needs the stricter reading — that no firm hand may touch a claimant statement at all — the endpoint gains a `licensedMode` gate rather than a rebuild, same shape as every other regulated-mode flip.

18. **FSA 2013 secrecy over AI inputs — open, needs counsel.** BNM's *Discussion Paper on Artificial Intelligence in the Malaysian Financial Sector* (5 Aug 2025) notes that where a model is trained on, or processes, information relating to the affairs or account of a customer of a financial institution, the **secrecy provision under the Financial Services Act 2013** may be engaged. Our exposure is narrower than training — we send a claimant's message for inference and retain nothing at the provider — but the question is not settled by that distinction alone, and it now applies to two paths (document extraction, intake normalisation). BNM points to its **Regulatory Sandbox** as the route where regulatory impediments exist. Put to counsel alongside item 7 rather than as a separate exercise.
19. **AI-scope assessment — write it down before it is asked for.** The NAIC model bulletin, which the market treats as the reference governance text, states that *simple rule-based systems without adaptive or predictive components may fall outside* the definition of an AI System, **but that carriers should document that assessment explicitly**. Until 6 Aug 2026 the intake conversation was purely deterministic and plausibly outside scope — a position held by accident and never recorded. Adding the normaliser spends part of it. What remains defensible, and should be written as a short assessment: the *flow engine* is a versioned rule set with no learned or predictive component; the *model* touches only input interpretation, never what is asked, what is decided, or what is paid. BNM's discussion paper expects the same lifecycle disciplines under different names — fairness, accountability, transparency, explainability, reliability, security. **Owner: whoever prepares the vendor security assessment; the evidence already exists in the flow versioning, the publish gate and the conversation transcript.**

## 7. Verification

- **Per phase:** exit criteria above; each is demonstrable in the running system (portal :4000, claimant :4001).
- **Compliance:** matrix rows flip from FAIL/PARTIAL to PASS only with (a) server-side enforcement evidence and (b) a CI compliance test asserting the control. Current **20 PASS / 10 PARTIAL / 1 FAIL**, recounted from the table on 6 Aug 2026 (never carried forward by hand) — the matrix is re-audited at each phase exit and the trend is the firm's readiness metric.
- **Feasibility gates:** the §9.6 go/no-go questions are checked at the phase boundaries stated there. Engineering must not outrun validated economics — in particular G2/G3 before Phase 2, and the §9.2 funding decision before Phase 3.
- **Architecture gate:** the three blocking defects in §4.3 must be closed before the platform holds real claimant data in any shared environment. **A1 (service auth) and A3 (segregation of duties) are closed; A2 (data ownership) has its foundation in place with six declared exceptions on a shrink-only ratchet.**
- **Execution order:** Phase 0 hotfixes (done — `e404fc5`), Phase 1a foundations batch (done — `939ac39`), Phase 0b architecture hardening (A1/A4/A8 done, A2 foundation in place), the remainder of Phase 1a (audit interceptor, consent/encryption, status guards — done; notifications deferred then un-deferred 4 Aug 2026, still to build), 1b (SLA engine + assessment-mode router — done), 1c (report engine — done). **Phase 2 is in progress:** FNOL email ingestion landed 4 Aug 2026 (`f1afb49`); see the §8 entry for what remains in the phase.
- **Gate debt carried knowingly:** Phase 2 began before G2/G9 were answered. Ingestion does not depend on them — policy matching runs against whatever `Policy` rows exist — but the policy file feed and proactive flight-delay detection both do, and G9 is the sanctioned replacement for the scraping that §6.11 rejects. It is one conversation with MSIG and costs nothing.

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
| **A4 CI + first compliance tests** | ✅ `.github/workflows/ci.yml` (typecheck job across six apps + compliance job) and **27 passing tests** in two suites: `tenant.service.spec.ts` (PII redaction, NRIC fail-closed masking, behavioural/fraud data withheld from claimants and support desk, private-note isolation) and `case-flows.spec.ts` (CSP 24h/30-day flags stay advisory, evidence completeness counts mandatory only, flow integrity, the "D7 522" alphanumeric-flight-code regression). Both suites are pure functions, so no database is needed in CI. *(27 was the count at Phase 0b close; 282 across 26 suites as at 5 Aug 2026 — §3.5 carries the current figure.)* |
| **A8 documentation correction** | ✅ `CLAUDE.md` now reflects reality: the three phantom services and the `infrastructure/` tree are listed as *not built*; AWS/EKS marked as target-not-actual; third-party integrations split into integrated vs not, with the offshore data-residency caveat stated |
| **A2 data ownership** | ◐ **foundation done** — bounded contexts declared and enforced by test (§4.3 A2 resolution); the six existing violations are declared exceptions on a shrink-only ratchet. **Remaining:** work the six exceptions down to zero, each by calling the owning service instead of writing its tables. New violations are now impossible to add unnoticed |

A5 (deployment artefacts), A6 (observability), A7 (gateway identity) remain tracked and deferred. A3 (segregation of duties) is in Phase 1a as `AuthorityLimit`.

### Phase 1a — complete (one item deferred by decision; see the table)

| Item | State |
|---|---|
| Travel evidence-checklist subtype scoping | ✅ 4-level precedence; FLIGHT_DELAY returns 3 requirements, was 16 |
| `oldValues/newValues` on claim audit rows | ✅ field-scoped diff, JSON-safe, pre-image captured pre-write and unredacted; wired to CLAIM_UPDATED / STATUS_CHANGED / ADJUSTER_ASSIGNED |
| Explicit handling-firm resolution | ✅ insurer panel nomination → `HANDLING_FIRM_TENANT_ID` config; single-firm assumption removed |
| `PolicySource.SCRAPED` → `FILE_FEED` | ✅ enum migration applied |
| Build gate | ✅ all five apps typecheck clean (two pre-existing claimant-web errors cleared) |
| Global `AuditLogInterceptor` persistence | ✅ writes rows. Records mutations, declared sensitive reads (payout decryption, claimant detail, report PDF), searches *by* an identity number, and every refusal. Ordinary listings are not recorded — burying the answers in noise is its own failure. **It never reads the request body**, asserted by a test against the source: bodies carry NRICs, bank details and passwords, and `audit_trail` is append-only, so a body written there could never afterwards be redacted |
| Audit of refused requests | ✅ **Guards run before interceptors in NestJS**, so `JwtAuthGuard`/`TenantGuard` rejections never reached the interceptor — the events most worth recording were recorded nowhere. Found by firing three rejected requests and counting zero rows. Failures now record in `HttpExceptionFilter` (the only place that sees them) and successes in the interceptor, giving exactly one row per request |
| Audit coverage: policies / video-service / auth | ✅ Login success and failure recorded with the user attributed — the HTTP layer cannot do this because `request.user` does not exist until after authentication, and a failed login records the attempted email but never the credential. Policy create/update records before/after values (insurer data is keyed in by hand, so "on whose authority did the system believe this cover existed?" will be asked). Recording deletion in video-service is audited **before** the delete, so a failure cannot destroy evidence with nothing to show for it |
| Shared `AuditWriter` | ✅ One writer in `@tci/prisma-client` used by all three services. Row *shape* is what makes the trail queryable: if one service writes `entityType: 'CLAIM'` and another `'Claim'`, an examiner asking "everything that touched this claim" gets a partial answer with no sign that it is partial |
| `audit_trail` append-only at DB level | ✅ Enforced by trigger, not by `REVOKE` — the application connects as the table owner and an owner bypasses privilege grants; a trigger binds regardless of who is connected, including someone at a psql prompt. UPDATE is never permitted. DELETE requires an explicit `SET LOCAL app.audit_maintenance = 'on'`, because PD 12.8 retention has to be able to purge beyond seven years and a retention policy that can never delete is not one. Verified: UPDATE and DELETE both refused, the flagged purge accepted |
| `Consent` entity + capture before processing | ✅ Consent is a record of *which wording* a named person agreed to, when, and whether it still stands. Two server-side gates, both verified live: a notice version cannot be **approved** unless it exists in both English and Bahasa Malaysia (PDPA s.7), and consent cannot be **recorded** against unapproved wording. Withdrawal retains the original grant, because evidencing *when* processing became unlawful needs both. Three purposes: claim processing, biometric analysis, cross-border transfer. **Draft EN/BM wording is seeded unapproved.** 10 tests |
| `isPdpaCompliant` retired as an input | ✅ the flag is no longer accepted from clients — a claimant ticking a box in a browser is not evidence a lawful basis exists — and claim responses now carry real `consent` standing read from the consent records, which the portal badge displays. Verified live: `POST /claims` with `isPdpaCompliant` is rejected, and the claim payload reports `{claimProcessing: false, …}` because no notice is approved yet. The **column itself still exists** and should be dropped with the retention work |
| `assertConsent` wired to processing | ✅ biometric analysis is now gated. video-service holds no consent data by design, so it asks case-service over the internal API (`GET /consent/check`, key-guarded, returns only a boolean) before any recording reaches the analyser — at both processing entry points. **Fails closed on every path**: no consent, unknown claimant, or case-service unreachable all refuse analysis, because voice/facial data is *sensitive* personal data going offshore and losing an analysis run is recoverable while processing without a basis is not. Verified live: refused without consent → granted → passed and recorded the transfer → **withdrawn → refused again immediately** |
| Bank-detail encryption | ✅ envelope encryption live (AES-256-GCM, versioned ciphertext, master key behind a `KeyProvider` so AWS KMS is a one-class swap with **no data re-encryption**). Plaintext column dropped in the same migration; sensitive answers masked in `Case.answers`; ciphertext never shipped to a browser; full value only via an **audited** firm-admin-only reveal endpoint. 15 crypto compliance tests incl. a simulated KMS custody migration |
| NRIC encryption | ✅ done — plaintext `claimants.nric`, `claims.nric` and `policies.insuredNric` dropped; each replaced by ciphertext + an HMAC **blind index** (`NRIC_INDEX_PEPPER`) + a clear `nricLast4` for display. Lookups match on the index; `verify-nric` compares indexes in constant time and never decrypts. Verified live: 0 plaintext occurrences across all three tables including JSON blobs, and a case submitted with a *different* phone number correctly resolved to the existing claimant by NRIC. The earlier concern that Trinity matches against a stored NRIC was **wrong** — Trinity compares document-to-document, so encryption costs fraud detection nothing. Correction to the earlier note: the pepper is effectively permanent (changing it invalidates every stored index) |
| Ciphertext confined to the server | ✅ `SENSITIVE_FIELD_OMIT` passed to every `PrismaClient`, so ciphertext and blind indexes are absent from query results **by default** and the few decrypting paths opt back in visibly (`omit: { nricHash: false }`). Services extend `PrismaClient<TciPrismaOptions>` so the omit reaches the generated types and a forgotten opt-in is a *compile* error. Found by review, not by assumption: `GET /cases/:id` and `GET /policies` had been shipping ciphertext and the blind index to the browser. A schema-reading test fails if a new encrypted column is added without an omit entry (mutation-tested) |
| Durable queue foundation | ✅ BullMQ on the existing Redis, three registered queues (`sla`, `notifications`, `retention`) under a `tci:` key prefix — namespacing is not cosmetic, two foreign Redis instances were found listening on 6379 locally and an unprefixed `sla` queue would consume another application's jobs. Missing `REDIS_URL` fails at boot rather than defaulting to localhost. Failed jobs retained 30 days vs 7 for successful ones, because "the breach escalation did not fire" is a question the audit trail must answer later. **Verified durable:** a delayed job was still queued after a full process kill and restart |
| Malaysian working-day arithmetic | ✅ **2026 Kuala Lumpur calendar installed** (31 July 2026), cross-checked across five independent public calendars with provenance and caveats recorded in the data itself. SLA clocks now compute real deadlines — verified live: assignment on Fri 31 Jul → preliminary report due Tue 11 Aug. 2027 remains absent, so the engine still refuses there rather than guessing. `addWorkingDays` / `workingDaysBetween` handle the non-uniform weekend (Johor, Kedah, Kelantan, Terengganu observe Friday–Saturday; the rest Saturday–Sunday) and state-specific holidays. 21 tests. **It refuses to compute a deadline in a year whose holiday list is not marked verified against the gazette** — most significant Malaysian holidays are lunar and cannot be derived from a rule, and a confidently-wrong regulatory deadline is worse than an error. See the blocker below |
| SLA clocks | ✅ `SlaPolicy` + `SlaClock`, wired to the claim lifecycle. Per-insurer policy overrides fall back to platform defaults seeded from the CSP timelines (ack 1, prelim 7, final 10, supplementary 5 working days; insurer decision 7 and payment 14 as `monitorOnly` — measured so the firm can evidence where a delay originated, never escalated against it). Pausing banks the remaining working days and resumes from the pause date, because CSP runs the final-report window from *complete* documents and a pause must not consume the firm's time. A partial unique index guarantees at most one live clock per claim and stage while keeping history. A 15-minute sweep marks breaches and escalates (level 1 → 2 at two working days → 3 at five; at level 3 the sweep now raises a `ComplianceEvent` — see the 11.2(d) entry). **Verified live:** assign → schedule → assess → report → approve started, stopped and recorded each clock, and a backdated deadline was swept to BREACHED at level 2 with the correct working-day lateness |
| Adjuster report engine | ✅ `AdjusterReport` with a DRAFT → IN_REVIEW → SIGNED → ISSUED lifecycle. **PD 12.6:** the four disclosure sections (facts, assumptions, methodology, sources) are mandatory on every report type and a report cannot be submitted or signed while any is blank — held in a code registry, not a table, because a control editable by an UPDATE statement is not a control. **PD 12.7:** authorship and sign-off are restricted to adjusting employees by pointing author/signer at `Adjuster` rather than `User`, so a FIRM_ADMIN who is not an adjusting employee is refused. Issued reports are immutable — a correction supersedes via `supersedesId` and both versions stay on the record. Issuing stops the matching SLA clock, since issuing the report is the act CSP measures. **Verified live** end to end incl. the PDF |
| Report PDF | ✅ Renders with the author's name and licence number on its face, every PD 12.6 section printed with the paragraph it satisfies, AI-assisted sections marked in the body and summarised up front, the sign-off basis, and an "the settlement decision rests with the insurer" notice. Drafts render watermarked. This closes the §3.1 12.6 finding that the only PDF in the system was a machine printout with no author, methodology or sources |
| `licensedMode` flag | ✅ The licence flip is real, not aspirational. `Tenant.settings.licensedMode` (default false — claiming registration the firm lacks is the worse error) decides whether the PD 12.7(b) countersign requirement **blocks** or is merely recorded. Demonstrated live: the same adjuster self-signing the same report is permitted as a TPA and refused once the flag is on. The countersign basis is persisted either way, so a signature is never silently assumed |
| Notifications (email transport, templates, delivery log) | ✅ **built 5 Aug 2026** — deferred 31 July by decision, un-deferred once staging hosting settled the provider question (SES `ap-southeast-5`). `NotificationTransport` behind a token, SMTP implementation covering Mailhog and SES, templates as a code registry, `NotificationLog` delivery record. Three obligations now discharged by the system rather than by remembering: the CSP acknowledgement to the insurer, the request for information to a claimant, and SLA breach escalation — which previously **reached no human** |
| Server-side status guards + `AuthorityLimit` | ✅ closes **A3**. Role gate (an outcome is not the assessor's to decide), segregation of duties (the assessor cannot decide their own claim unless a limit expressly permits it), and a monetary ceiling — all enforced in the service, since a role decorator cannot know who assessed what. An absent limit means *no* authority rather than unlimited, because a missing row is far more likely an oversight than a decision. The basis is written onto the audit row. **18 tests**, verified live |
| CI runs every compliance suite | ✅ the re-audit found the CI job ran only `@tci/case-service`, so the gateway's audit tests and crypto's encryption tests supported no matrix verdict. Now `pnpm test` across all packages — possible only because the aggregate was made green earlier |

### Shared crypto infrastructure (supports both encryption items)
`@tci/crypto` is a package, not case-service-local code, because the gateway encrypts too. It holds `EncryptionService`, the `KeyProvider` (master-key custody) and `KeyStore` (data-key persistence) interfaces, and `EnvKeyProvider`. It deliberately does **not** depend on Prisma. The Prisma-backed key store lives once in `@tci/prisma-client` (`PrismaKeyStore`) — it was duplicated byte-for-byte in two services, and since the queries encode *which key version is active*, two copies drifting would produce undecryptable data rather than a clean failure. The seed uses the same class and the same master key, so seeded personal data is encrypted exactly as the application writes it; verified by decrypting seeded ciphertext from a separate process.

### Open decisions blocking further Phase 1a work
1. ~~**Encryption key custody**~~ — resolved: master key in `.env` behind `KeyProvider`, AWS KMS is a one-class swap with no data re-encryption. Key custody is now only an operational step, not a design decision.
2. ~~**BullMQ now or in 1b**~~ — **decided: now** (30 July 2026). It gates five of the six remaining Phase 1 matrix rows, so deferring it would mean building the CSP clocks twice.
3. ~~**Legal review of the consent wording**~~ — **resolved by the principal's decision, 31 July 2026**: reviewed (AI-assisted, substantive — two real defects found and fixed) and approved under the firm-admin identity. Independent counsel review remains recommended; changes ship as v2.
4. ~~**Gazetted 2026 holidays**~~ — installed 31 July 2026 for Kuala Lumpur from public calendars, cross-checked five ways, with the sources and one disputed date (23 March) recorded in the file. Still worth a gazette check before relying on a deadline in a dispute. **2027 will be needed when published.** Original note: gazetted public holidays — needed before any CSP deadline is trustworthy. `MALAYSIAN_HOLIDAYS` in `apps/case-service/src/sla/working-days.ts` has the fixed-date national holidays; the lunar ones (Aidilfitri, Aidiladha, CNY, Deepavali, Thaipusam, Wesak, Awal Muharram, Maulidur Rasul), the Agong's birthday and each state's holidays must be pasted from the Prime Minister's Department gazette, then `verifiedAgainstGazette` set to true. Roughly a five-minute data-entry task per year, deliberately not guessed.

### `Assignment` — the journey now starts where it starts (31 July 2026)
The claim journey began at `Claim`, which meant it began when the firm decided to start work rather than when the insurer asked. Consequences: no record of the appointment, and the CSP one-working-day acknowledgement measured from nothing — it could be neither met nor missed, only ignored.

`Assignment` is that missing front end. Receiving an instruction starts the acknowledgement clock from `receivedAt` (which is not the same as when the row was written — an email logged late still runs from arrival). Acknowledging *or declining* stops it: both answer the insurer, and leaving the clock running on a correctly-refused appointment would manufacture a breach out of a conflict of interest properly declared.

Three design points worth keeping:
- **Idempotent on (insurer, externalRef).** A resent email, a retried API call or an overlapping Merimen poll returns the existing record. Duplicate appointments would each carry their own clock, and the firm would appear to have breached one of them.
- **A claim cannot be opened on an unacknowledged appointment.** Starting work on an instruction the firm has not answered is precisely how the acknowledgement gets forgotten, and the breach that follows is silent until someone asks.
- **SLA clocks now hang on a claim *or* an assignment**, enforced by a `num_nonnulls(...) = 1` check constraint. A clock with neither is orphaned; with both, ambiguous — and both states are invisible until the sweep reports a breach nobody can explain.

Channel is captured from day one (EMAIL / PORTAL / MERIMEN / API / MANUAL) so Merimen is an ingestion adapter later, never a schema assumption (§6.4).

### s.143 claim-file export (31 July 2026)
One endpoint answers "give us everything on this claim". Design points worth keeping:
- **Completeness is data, not hope.** `BUNDLE_SECTIONS` lists the eleven record types a complete file carries; assembly is checked against it and refuses if a section is missing — a partial file presented as complete is the §3.6 failure with a regulator on the receiving end. A test pins the list to the record types the matrix names.
- **The export seals itself.** The bundle's canonical sha256 (key-order-normalised, so formatting cannot change it) goes onto the append-only trail in a `CLAIM_FILE_EXPORTED` row. The firm can later prove what it produced to BNM byte-for-byte — or detect that it differs.
- **The manifest distinguishes `0` from `null`**: an empty documents list means "we looked, there are none"; a null assignment means "this record does not exist" (a claim that predates `Assignment`). An examiner reads those very differently.
- Soft-deleted documents are in the file with their deletion facts — PD 12.8 is why they still exist.
Verified live: adjuster refused (403), firm admin got the full bundle, no ciphertext in the output, and the audit row carried the hash.

### Consent wording: reviewed and approved (31 July 2026)
The first of the blocking decisions arrived: the principal directed review and approval of the consent wording. The review was substantive, not ceremonial — two real defects found and fixed before approval:
1. **No contact particulars anywhere.** Every notice said "by contacting us" and never how. s.7's substance is a *route* to access, correction and complaint; every notice now directs to the claims administrator named where the notice is shown, and names the Personal Data Protection Commissioner as the escalation avenue — in both languages.
2. **The cross-border notice cited a privacy notice that did not exist.** It now names each offshore recipient and country directly (Daily.co, Hume AI, Google Gemini, Supabase — United States), with the commitment that an unnamed recipient means a new notice version before any transfer. This is the CBPDT recipient-and-purpose requirement met in the notice itself.
Both fixes are pinned by tests. Approval provenance is recorded honestly in the wording file and the audit trail: approved at the principal's direction under the firm-admin identity, AI-assisted review, **independent Malaysian counsel review remains the standing recommendation** — counsel's changes ship as v2, and v1 consents stay provably tied to v1 wording, which is what the immutable-notice design was built for.
Consequences now live: consent is capturable in production flows; the biometric gate answers `granted` after a real grant; and the Gemini cross-border gating that was sequenced behind an approvable consent is **unblocked** (not yet built). One demo consent (biometric, the seeded claimant) is left in place so demo video-analysis flows work.

### Final comprehensive audit (31 July 2026, close of session)
A fresh-eyes sweep across everything, not only the latest batch. Found and fixed: `packages/crypto` missing from CLAUDE.md's tree (a package holding a standing decision, invisible to the file that lists standing decisions); the §8 Phase 1a heading still reading "in progress (~15%)" months of work later — headings stale as silently as rows; and §3.6 #10 re-examined and **closed as honest**: the stub is labelled NOT IMPLEMENTED, SKIPPED is literally true, and the value renders nowhere, so no false claim remains. §3.6 stands at **10 of 10**. The ownership exceptions were re-verified at exactly six against a ratchet of six. With this, the plan and the codebase agree everywhere either speaks.

**Terminus note.** Every buildable control is built, verified live, and graded; every non-build is a recorded decision; every PARTIAL names its single blocking input. The next change to this repository should be caused by a decision arriving — consent wording, hosting, counsel on G8 and `UNDER_REVIEW`, MSIG's fee terms, the 2027 gazette — not by another sweep. Further audit passes without new inputs will find only what new inputs create.

### Writer migration, and two deliberate non-builds (31 July 2026, last)
The bespoke audit writers in claims, cases, signatures and documents are migrated onto the shared fail-soft `AuditWriter` — the defect class where a service's own bookkeeping fails the request *after* the state change (seen live twice) is now structurally gone from case-service, and the signatures rows gain the actor attribution the bespoke write had silently dropped. Verified live: status change and case creation both produced attributed rows through the shared path. The one deliberate direct write that remains is the export seal, which fails closed because the sealed row is the deliverable.

Two things were considered and **deliberately not built**, recorded so the decision outlives the session:
- **The Sch 7 template registry.** With no notification transport and no approved wording, a versioned-template registry would be inert machinery with no consumer — the §3.6 false-comfort pattern in a new coat. It gets built alongside the notification layer, where it has a consumer on day one.
- **The remaining A2 exception rewires.** The video→claim and risk-engine rewires have settled designs (recorded in `data-ownership.ts` against each exception) but need Daily.co credentials and a runnable analyzer pipeline to verify against, and this session's standard is that nothing ships unverified. The exceptions remain declared, ratcheted and tested — the control (no *new* violations) is enforced; the debt is visible, priced, and parked rather than hidden.

### Billing, the CSP anchor, and employment (31 July 2026, late)
The last buildable FAIL and two PARTIAL-closers, in one batch:
- **Billing** is client-agnostic by design (§6.8): rates are `FeeScale` rows per insurer, SCALE bands are *progressive* (each rate applies to its slice — flat-on-total would make fees jump at band edges), SST is a configurable rate on the professional fee only, and every note stores its derivation because the number without its working is unanswerable in a dispute. Verified live to the sen.
- **`documentsCompleteAt`** finally anchors the final-report clock where CSP puts it — complete documents — set-once on the upload that completes the mandatory set, with `REPORT_PENDING` demoted to an idempotent fallback. The checklist now also gates that transition (registered blocks, TPA records), which closes §3.6 #8: the UI's "3 of 5 documents" finally has enforcement behind it.
- **`employmentType`** makes 12.1(a) checkable: PART_TIME produced the advisory on a live assignment; registered mode blocks it.
The re-audit also caught **12.7 lagging the competency build** — the row still said the countersign keyed off unknown seniority, five days of commits after real seniority landed. Upgraded on evidence, and a reminder that rows describing *dependencies* between builds stale silently when the dependency lands.

### Correction record (31 July 2026, end of day)
Two consecutive commit messages this evening stated matrix counts that the recount output, printed directly above them, contradicted — 15/14/2 and 16/13/2 against actual outputs of 14/14/3 and 15/13/3. The document's own headline was always written from the real recount (the substitution uses the counted values), so the *plan* stayed accurate; the *commit messages* did not, because they were composed before reading the recount. Git history is append-only by the same principle as the audit trail, so the wrong messages stand and this note corrects them. Process fix: the recount now hard-fails on double-verdict rows, and counts are quoted in prose only after the recount prints.

### The final buildable batch (31 July 2026): rotation, QA, supplementary, MI, 13.1
Four FAIL rows closed or advanced in one pass — everything still buildable without external input:
- **Rotation (11.2(b))** monitors, never blocks: a hard rotation rule would force the less qualified adjuster onto claims, which 12.2(b) forbids from the other direction. The advisory speaks only on an unbroken 3+ streak, and stays silent when someone new is assigned — that being what rotation wants.
- **Work-quality reviews** attach to issued reports only, refuse self-review, and require findings below SATISFACTORY — the evidence chain behind `performanceSatisfactory` in 12.4(b) recognition.
- **Supplementary reopen** gives CLOSED its one legal exit, in the state machine so it tells the truth, with the 5-working-day clock started by the act itself. Works under a legal hold: the hold protects records, not work.
- **Insurer-side MI** reports the `monitorOnly` clocks per insurer — the delay-origination evidence the monitorOnly design existed to produce.
- **13.1** drafts its own rows from KeyPerson changes, because the change that triggers the notification *is* the KeyPerson event.

The remaining FAILs, stated precisely this time: **AMLA/CTF screening** is blocked on counsel gate G8; **fee settlement (CSP 11.16–11.18)** is buildable but is the Phase 2 billing build — `FeeScale`/`FeeNote`/SST — sequenced after MSIG's actual fee terms exist, per §6.8, rather than invented ahead of them. (An earlier version of this note said "two FAILs, both blocked"; the fee row had been miscounted under a malformed-row defect and the Consent §3.4 row had never been updated when the machinery shipped — both now corrected.)

Re-audit note, corrected: the sweep ultimately found **four** rows where an early re-audit regex had written the new verdict into the *target* column of the four-column §3.2 table, leaving the old verdict in place — ITO decision, preliminary report, final report, and records-readily-available. Every recount since had read the stale first cell, so the published totals were consistently *conservative* (PASS/PARTIAL upgrades counted as FAIL/PARTIAL) — the right direction to be wrong in, but wrong for three weeks of commits. All four repaired; the recount script now hard-fails on any row carrying two verdicts, so this class of error cannot recur silently. Two of the repaired rows were also stale on their own terms ("cannot operate until the holidays are entered" — the 2026 calendar was installed this morning): preliminary-report reaches **PASS**; final-report was PARTIAL at that point because its clock anchored on `REPORT_PENDING` rather than a `documentsCompleteAt` event — since superseded, the anchor now exists and the row is PASS.

### Fit and proper (31 July 2026) — the criteria as data
PD 10.1/10.2. `KeyPerson` + `FitProperAttestation`, with the ten criteria transcribed from the paragraphs and pinned by test, so the attestation form *is* the regulation. The rules that matter: **silence is not attestation** — every applicable criterion must be answered, and a shareholder's 10.1-only answers cannot satisfy a KRP; a **NOT_MET is recorded, never blocked** (the same honesty shape as screening FINDINGS and COI declarations — a register that punishes honest answers stops receiving them), but it must be described, it flips standing to NOT_FIT, and it raises a CRITICAL event onto the Board register — the fitness finding and the Board's visibility of it arrive in the same act. The annual re-attestation cycle is recorded as the firm's own policy choice, deliberately not attributed to the PD, which requires ongoing compliance without naming a period.

Re-audit note: the sweep also caught a malformed matrix row — an earlier scripted edit had left the COI row with seven cells in a five-column table. Repaired; the reaudit habit pays for itself in ways the code tests cannot.

### Compliance events and the Board report (31 July 2026)
PD 11.2(d), built as wiring rather than a standalone register: the raisers sit where the controls already are. Level-3 firm-side SLA breaches and conflict attestations raise events automatically — idempotent **by fact**, keyed to the clock or the claim+adjuster pair, because the fifteen-minute sweep observes the same breach repeatedly and a register that duplicates per observation buries itself. Insurer-side breaches never reach the firm's own Board: that would misstate whose breach it is. Restraint is the design throughout — levels 1 and 2 are operations; a feed that escalates everything is a feed the Board stops reading. Resolution requires a note, and the Board report stamps every included event with `boardReportedAt`, so "was the Board told" has a date for an answer. Verified live end to end, including the two-sweeps-one-event dedupe.

### Background screening (31 July 2026)
PD 11.2(e)'s minimum is data (`MINIMUM_CHECKS`), so "screened" has one definition and a missing check is visible rather than assumed away. The design point worth keeping: **FINDINGS is not failure.** A screening regime where a finding disqualifies teaches people not to record findings; here the finding must be *described* (an undescribed one is refused) and it surfaces in standing without blocking anything — "we found it, considered it and hired anyway" is exactly the record that protects the firm. Late checks are the same shape of honesty: counted, because the assurance exists, but flagged, because "prior to employment" it was not.

### CPD ledger (31 July 2026)
PD 12.9–12.11. Two honesty rules shaped it: **only recognised-provider hours count toward the floor** — twenty hours attended with ten qualifying is a shortfall, and the unrecognised ten stay on the record as what they are — and **an open year is never a shortfall**: mid-year standing is a trajectory (ON_TRACK / BEHIND against pro-rata), because a dashboard that calls February fourteen hours short trains everyone to ignore it by March. SHORTFALL is reserved for closed years, which is also the only case the assignment advisory speaks on. Hours must be completed in the year they count toward, and the database bounds a single entry at 60 hours — a 100-hour entry is a typo, not a programme.

### Conflict of interest (31 July 2026) — the last blocking gap in the assignment path
`ConflictDeclaration` + per-claim `ConflictAttestation`, PD 10.3 / 12.1(d). The design decisions that matter:
- **A matched, unresolved conflict blocks in every mode.** The licence-flip pattern (advisory as TPA, blocking when registered) governs gaps the firm might not know about — competency, licence verification. A declared conflict is different in kind: the firm has it *on record*, and assigning through it is a choice 12.1(d) does not offer. Same reasoning as SUSPENDED.
- **Declaring must cost nothing, or people stop declaring.** The declaration is always accepted; it is the assignment through it that is refused, and the refusal names the remedy — resolve or reassign — never "delete the declaration". Declarations are resolved, not deleted, with a mandatory reason by a named person.
- **"Clear" is distinguishable from "never screened".** Every assignment audit row records how many live declarations were screened, so an examiner can tell a clean screen from an empty register.
- The attestation is upsertable (positions change mid-claim), attesting *with* a conflict requires describing it, and registered mode refuses report submission without the author's clear attestation — logged as an advisory while a TPA so the habit forms first.

### s.143 archive packaging (31 July 2026) — and a design flaw the probe caught
The export now has its second form: a ZIP an examiner walks away with — `claim-file.json` (the sealed bundle), `documents/` and `documents-soft-deleted/` holding the actual binaries (visibly separated: the deleted ones are part of the record, and the separation keeps the examiner's view honest), and `reports/` holding rendered PDFs. An unfetchable binary is declared in `MISSING_FILES.txt` *and* on the audit row — the archive may be thinner than intended, never silently so.

**The probe caught a real flaw: the export shipped without its seal.** A synthetic user broke the audit row's FK, the fail-soft writer swallowed it as designed, and a complete archive went out with no `CLAIM_FILE_EXPORTED` row. For every other operation fail-soft is the right trade (never block claims handling over bookkeeping). For the export it is exactly wrong — the sealed row *is* part of the deliverable. `recordExport` is now the one **fail-closed** audit write in the system: if the seal cannot be written, the export is refused. Verified live both ways: real admin → sealed archive, header sha matching the trail; FK-breaking user → 500, nothing produced.

Two smaller notes: archiver@8 is ESM-only and unusable from the CJS Nest build (pinned to v7 with a comment), and `safeName`'s "no information left" check originally used `\w` — which matches underscore, the very character the cleaning inserts. The test caught it.

### Consent gate + transfer register (31 July 2026)
The two halves of the s.129 exposure, closed together because they sit on the same offshore paths:

**Biometric consent gate.** video-service asks case-service (internal API, boolean answer) before any recording reaches the analyser, at both processing entry points. Fails closed on no-consent, no-claimant *and* on case-service being unreachable — an outage is indistinguishable from "no consent", and only one of those errors is recoverable. Verified live through the full loop, including that **withdrawal takes effect immediately** on the next analysis attempt.

**Transfer register.** `TransferRecord` + a shared `TransferRegister` writer (same pattern and reasoning as `AuditWriter`: two services describing the same recipient differently gives a regulator a partial answer with no sign it is partial). Providers come from one registry (Hume, Gemini, Daily.co, Supabase — country + plain-language data description); a test pins the registry to the integration table so a new offshore provider cannot be added without becoming recordable. `lawfulBasis` is nullable **on purpose**: the gated biometric path records `CONSENT s.129(3)(a)`, the ungated paths record null — a register that invents a basis is worse than the gap it papers over.

**Found while verifying:** video-service never loaded the root `.env` (its `envFilePath` lacked `../../.env`), so `INTERNAL_API_KEY` was unset and its guard — correctly failing closed — was refusing **every** internal request to the service in local dev. The A1 verification had exercised the gateway and case-service paths, not video-service's own guard. Fixed; risk-engine already had the entry.

### Regulatory-source audit, 31 July 2026 (plan and code vs the PD/FSA verbatim)
Every matrix citation re-read against the source PDFs rather than trusted from earlier extraction. **The structure held**: PD 12.1–12.11 and 13.1, 10.1–10.3, 11.2(a)–(e) match the rows nearly verbatim; FSA s.146 explicitly covers *registered persons* (so the audit-readiness row is correctly grounded), s.121's "financial service provider" includes a registered person (confirming the applicability note), and s.143, s.139, s.124 + Sch 7 and the s.17(2) exemptions are as cited. Headline counts match the rows.

Two citation errors found and fixed:
1. **The <5-years countersign was attributed to PD 12.3.** It is **12.7(b)**; senior recognition is **12.4(a)**; 12.3 is a different control — one year's close supervision for *new* adjusting employees. The code's persisted `countersignBasis` strings now cite the right paragraphs. (Reports signed before this fix carry the old wording — the record is append-only in spirit; the control itself was always right.)
2. **Two different AMLAs in one document.** PD 12.11's AMLA is the *Association of Malaysian Loss Adjusters*; §3.4's and G8's AMLA is the *Anti-Money Laundering Act*. `Adjuster.amlaMember` means the association. Now disambiguated where each appears.

Two places the build is deliberately stricter than the letter, now recorded as decisions rather than accidents:
- 12.7(b) says "adjusting work experience" (general); the countersign rule uses years **in the subject** — the 12.4(a) reading — so a generalist with ten years but one in fire still needs a senior countersign in that subject.
- 12.6 addresses the "final assessment or recommendation"; the disclosure sections are mandatory on **every** report type including preliminary and interim, because an insurer acts on interim views too.

### Retention (PD 12.8) — deletion split into two acts (31 July 2026)
"Delete" now means two different things with different owners. *Soft delete* is the user act: the document or recording drops out of listings, but row and file are retained. *Purge* belongs to the retention sweep alone (daily 03:00 on the `retention` queue), permitted only when the claim closed at least the retention period ago and no legal hold stands — decided by `canPurge`, whose basis is written to the audit row **before** the destruction, so a purge that fails halfway leaves evidence of the attempt rather than silence.

The seven-year floor is enforced three times over: in `assertRetentionYears`, by test, and by a database CHECK constraint — the constraint outlives the service, catching a row written through psql. `Claim.closedAt` (set on transition to CLOSED) anchors the period: seven years from *closure*, not creation, because an open claim's records are working records.

Legal holds sit on the claim (place/lift, reason mandatory, both audited, compliance-officer roles) and outrank the calendar entirely. Verified live: with both test claims backdated to closed 2018, the sweep purged the unheld document and kept the held one — `2 examined, 1 purged, 1 kept`.

Two findings from the live verification:
- **StorageService had no delete method at all**, so even the old non-compliant hard delete orphaned its file. `deleteFile` now exists, for exactly one caller: the sweep, behind `canPurge`.
- **The legacy bespoke audit write failed the request after the state change** — a foreign-key mismatch in its own bookkeeping turned a successful soft delete into a 500. Migrated to the shared fail-soft `AuditWriter`, which is what it exists for. The remaining bespoke writes in claims/cases/signatures should follow.

A source-scan test now bans `prisma.document.delete` from the documents service and requires it in the retention service behind `canPurge` — the purge path must exist (a retention policy that can never delete is not one), but only there.

### Email provider: Amazon SES in Malaysia, not Resend — decision deferred to the hosting choice
**Parked 31 July 2026.** The provider comparison below stands, but it is downstream of a decision not yet made: nothing is deployed anywhere and no hosting provider has been chosen. Settling on AWS Malaysia would make the email choice automatic, which is the argument for taking the decisions in that order rather than this one. *Postscript, later the same day: exactly that happened — staging is now AWS `ap-southeast-5` (see the staging entry below), so SES `ap-southeast-5` is the answer whenever the notification engine is asked for.*

Amazon SES became available in **Asia Pacific (Malaysia) ap-southeast-5** on 21 November 2025, which AWS cites explicitly as helping manage data sovereignty. That makes notification email a domestic transfer with no s.129 question at all — and it aligns with the AWS Malaysia target already in §3.4.

Resend was considered and is workable but weaker: its region selection controls only where mail is *sent from*. Its own documentation states that all account data, email metadata, logs and API records are stored in the **United States regardless of region**, so choosing Tokyo buys latency, not residency. Using it would need a s.129 basis, a transfer record and subject notification — work that SES in-country avoids entirely.

Either way the notification layer should carry **no claim content**: "there is an update on claim X, sign in to view" rather than embedded details. That keeps the personal data in the email down to an address and a reference, which is the mitigation worth more than the paperwork.

### PDPA amendment findings (31 July 2026)
Two things the research turned up that change existing rows rather than adding new ones:
1. **Biometric data is now sensitive personal data** under the Personal Data Protection (Amendment) Act 2024. The platform runs Hume AI on voice prosody and MediaPipe on faces, both offshore — so the cross-border row (§3.4) is more serious than "another processor to paper over", and the higher consent bar applies. The `BIOMETRIC_ANALYSIS` consent purpose exists for exactly this.
2. **The whitelist is gone.** s.129 now permits transfer where the destination has substantially similar law or adequate protection (assessed by the data controller via a Transfer Impact Assessment), or under s.129(3) conditions — of which consent, s.129(3)(a), is the one the platform can actually operate. Whichever basis is chosen, the CBPDT Guidelines (April 2025) require subject notification naming the recipient, contractual safeguards, and a **record of each transfer**. ~~No transfer register exists yet~~ — built 31 July 2026; see the consent-gate + register entry in §8.

Neither has been reflected in the matrix verdicts yet — both want counsel's reading first.

### Compliance re-audit, 31 July 2026
Every row re-checked against the running system rather than against intent. **0/7/20 (first audit) → 1/7/23 (recount) → 4/11/16, then 5 PASS / 11 PARTIAL / 15 FAIL after `Assignment` closed PD 11.2(a).**

Four rows reached PASS: PD 12.6 report disclosure, CSP records-readily-available, FSA s.146 examination readiness, and PDPA NRIC/bank protection. Seven moved FAIL → PARTIAL.

Two findings from the re-audit itself, both fixed:
- **The CI job ran only `@tci/case-service`.** The gateway's 24 audit tests and crypto's 15 encryption tests passed locally and never executed in CI, so under §3.5's own rule they supported no verdict. CI now runs `pnpm test` across every package — which only became possible after the aggregate was made green.
- Rows that *looked* ready were held back on evidence: PD 12.7 stays PARTIAL because the countersign keys off unknown seniority rather than real seniority; 12.5 and the CSP report clocks stay PARTIAL because the engine refuses to run without gazetted holidays. Built is not the same as operating.

### A real leak the audit work found, and closed
Wiring the exception filter surfaced an NRIC in the trail: Nest's 404 message quotes the request, so `Cannot GET /api/v1/claimants?nric=880101-14-5555` was recorded verbatim — into the one table deliberately made impossible to correct. Found by grepping the live trail for NRIC-shaped strings rather than by reasoning about it. Exception messages are now passed through `redactMessage`, which strips sensitive `key=value` pairs and masks anything NRIC-shaped; the leaked row was purged using the maintenance flag, which is precisely the case that hatch exists for. The lesson generalises: **any free text copied into an append-only table needs redacting, not just fields we chose to store.**

### ~~Seniority is the honest gap in the report engine~~ — resolved 31 July 2026
The gap this section recorded is closed: `AdjusterCompetency` now feeds real subject-matter years, the PD 12.4 recognition state and the PD 12.3 supervision window into `countersignDecision`, exactly as promised — the same function, now with real inputs. The safe defaults remain for records the model has no answer for: unknown seniority reads as junior, unknown start date reads as under supervision. Recognition is an *act*, not arithmetic: refused below the five-year floor, refused without the 12.4(b) considerations, auto-revoked if the years fall below the floor, and five unrecognised years do not make a countersigner senior.

### Lifecycle gap surfaced by the SLA work
`DOCUMENTS_PENDING` and `UNDER_REVIEW` exist in `ClaimStatus` but appear in no transition list, so no claim can reach them. Two consequences: the pause-on-awaiting-documents behaviour cannot fire, and the insurer-decision clock never starts. This also caused a real defect — `APPROVED` originally left the ten-day final-report clock running because it was stopped only at the unreachable `UNDER_REVIEW`, which the sweep would have recorded as a breach the firm never committed. Fixed, and `sla-lifecycle.spec.ts` now walks every reachable path and fails if any route strands a firm-owned clock. Closing the gap properly belongs with the Phase 1 status-guard work.

### Known non-blocking defects
- `Claim.claimType` is null for every non-motor claim, so the claimant app renders a blank "Claim Type" label. Cosmetic; the real subtype lives on `TravelClaim.travelClaimType`. Fix when the claimant claim-detail view is next touched.
- **Generated documents show `••••1234` instead of the full NRIC.** video-service and risk-engine render reports but hold no encryption key by design, so they cannot decrypt. The fix is an audited identity endpoint on case-service that they call — deliberately not a second copy of the key. Adjuster reports are a Phase 1 item, so this lands with the report engine.
- `pnpm dev` had been failing outright: turbo's default concurrency is 10 and the repo now has 10 persistent dev tasks. Raised to 20 in the root `dev` script so adding an app does not break local startup again.

### Staging environment decided: AWS EC2 ap-southeast-5 (31 July 2026)

The first post-terminus commit, caused — as the terminus note required — by a decision arriving: the principal chose a hosting provider for staging. Vultr was considered and set aside for two structural reasons: no Malaysia region, and zero parity with the production target. **Decision: one EC2 instance in `ap-southeast-5` (Malaysia), Ubuntu 24.04, x86 (`c7i.xlarge` recommended), running the whole stack under Docker Compose behind a Caddy edge.** Staging on the production target region turns staging spend into rehearsal: the KMS custody path, the SES `ap-southeast-5` notification path and the residency story all get exercised before production exists.

- **Rule, recorded here deliberately: staging holds synthetic data only** — seeded demo identities, never a real NRIC, recording or bank account. In-country hosting makes this discipline rather than legal necessity; it stays the rule regardless.
- Artefacts live in `deploy/staging/`: a multi-target Dockerfile (one shared build layer, four Node runtimes differing only in workdir), a Python image for risk-analyzer (ffmpeg + MediaPipe deps), Compose stack with internal-only Postgres/Redis and a one-shot migration job, Caddy edge (automatic TLS, both frontends, `/api/*` to the gateway), a secrets bootstrap that generates fresh per-environment keys and refuses to overwrite, and a runbook.
- This partially closes A5 (§4.3): staging deployment exists and was verified by running the identical stack locally — migrations applied, seed ran, login → JWT → gateway → internal-key → case-service returned data through the Caddy edge, both frontends served, storage volumes writable, analyzer reachable from risk-engine. Production deployment (Kubernetes/Terraform, DR, CI deploy) remains open.
- **The containerised build found five real defects local development had been masking**, each fixed and re-verified: (1) `.dockerignore`'s `**/uploads` wildcard excluded the `src/uploads` *source module* from the build context — video-service compiled locally, failed in the container; (2) committed `tsconfig.tsbuildinfo` files convinced tsc inside the container that packages were "already built", so `@tci/shared-types` emitted nothing and dependents failed; (3) the gateway's `/health` disk check was set to report DOWN above **10%** disk used — it had been returning 503 on every realistically-filled machine, unnoticed because nothing consumed the endpoint until the container healthcheck did (now 90%, and container healthchecks probe liveness, which is the correct question for a restart decision); (4) `requirements.txt` used `>=` floors, so the container resolved `hume 0.14.0` whose restructure crashed the analyzer on import while the venv quietly ran the tested 0.13.11 — now exact pins; (5) `HumeAnalyzer()` was constructed at import and raised without a `HUME_API_KEY`, crash-looping the whole analyzer in any environment without offshore keys — it now boots, logs why Hume endpoints are disabled, and returns a clear 503 only on the Hume-backed route. The pattern across all five: *works-on-my-machine is not a property of the code, it is a property of the machine* — which is the argument for the staging dry-run having happened before EC2 exists.
- Two small durable improvements landed alongside: the gateway now honours `CORS_ORIGINS` (the hardcoded dev-origin list is the fallback), and the seed prints the handling-firm tenant id it wants copied into `HANDLING_FIRM_TENANT_ID`.
- Notifications were deferred at the time of this entry; the provider question the hosting decision answered — SES in `ap-southeast-5` — is the one the engine was built against on 5 Aug 2026 (see the entry below).

### Portal session lockout — the refresh path was destroying tenant state (4 Aug 2026, `4431602`)

Reported as "session expired but it does not redirect to login". The premise was inverted, and acting on it would have fixed the wrong thing: the session had **not** expired. A stale access token triggered the refresh interceptor, refresh **succeeded**, and the portal then showed "Account Activation Pending" to a fully authenticated adjuster — which is exactly why no redirect fired.

`setAuth(user, accessToken, userTenants = [])` read an omitted third argument as "no tenants" rather than "unchanged", so the two callers that legitimately update only part of the auth state — the token refresh and the profile patch — overwrote both memberships with an empty array. Zustand's `persist` then wrote the loss to `localStorage`, making a transient mistake survive reloads. The screenshot contained the tell: the sidebar still showed the tenant name (read from the untouched `user` object) while the dashboard claimed there were none.

Fixed at the contract, not the two call sites, so the next caller that omits the argument cannot reintroduce it. `tenantsKnown` now distinguishes *confirmed none* from *not yet known* — a distinction an empty array cannot express, and the absence of which turned a token refresh into a lockout screen. It is deliberately **not persisted**, so it resets on load and must be re-earned from `/auth/me`: that heals already-corrupted storage without a `migrate` block and without forcing anyone to log in again. `useCurrentUser` moved to `AppLayout`, since it previously ran only on the Settings page and no other screen could recover. Both `isAwaitingActivation` sites now require positive evidence; uncertainty renders the normal UI.

### Phase 2 — FNOL email ingestion (4 Aug 2026, `f1afb49`)

The MSIG pilot's primary intake, and the first Phase 2 exit criterion. **MSIG API integration deliberately not built** — `PolicySource.API` stays "future"; policy data remains `MANUAL` or `FILE_FEED`.

- **Feeds `CasesService.create()` rather than writing `case` rows.** Policy auto-match, the CSP 24-hour/30-day deadline flags, claimant resolution, handling-firm routing, bank-detail encryption and the audit row all already live there. A second creation path would drift, and the symptom would be claims quietly missing a deadline flag rather than an error. Extracted values are checked against the intake flow's own validators first, so ingestion cannot create a Case the portal would have refused.
- **Idempotency is the database's, not the worker's.** `InboundMessage.messageId` (RFC 5322) is unique, and the poller claims a message by inserting its row. Two concurrent pollers would both pass a prior `findUnique` and both insert; one loses on the constraint instead. Verified against Postgres, not merely asserted in the schema. The row is written **before** parsing, so an email that cannot be understood still leaves a trace an operator can act on — silently dropped intake is invisible, because nobody goes looking for a claim that was never created.
- **No LLM in the parser** (§6.3). An FNOL email is the most PII-dense artefact in the system and today's default provider is offshore Gemini with no established transfer basis (§3.4). Extraction is deterministic and explainable, returning `missing[]` as the documented seam for a local second pass once §6.15 is closed. Two rules the tests pinned: Malaysian mail is **day-first**, so `03/04/2026` is 3 April — read month-first it shifts the incident date and every CSP deadline computed from it; and "delayed baggage" is a luggage claim, not a flight-delay one.
- **The raw email is never stored.** It carries NRIC and bank details in the clear, both of which this platform encrypts at rest. `InboundMessage.parsed` holds claim facts only, asserted by a test. That is also why acknowledgement adds a private IMAP keyword rather than deleting: the mailbox stays the only copy, which is what makes operator retry possible. `\Seen` was rejected because a human opening the mailbox would otherwise hide an unprocessed notification from the poller.
- `InboundMailSource` behind a token so SES inbound or a webhook can replace IMAP without the pipeline knowing; `ingestion` queue on the existing BullMQ foundation; polling only when `FNOL_INTAKE_ENABLED=true`, with a **loud error** when enabled but misconfigured, because intake that appears to run and receives nothing is the failure mode that ends pilots. Operator queue (list/retry/ignore) is role-gated and tenant-scoped, with dismissal audited.
- **Verified:** 282 tests pass (20 new), typecheck clean, routes live, duplicate Message-ID rejected by Postgres. The new tests caught two real parser defects before review — "cancel the trip" failing to classify, and "Delay **of 8** hours" parsing as flight "OF 8".
- **Operational note:** the migration was applied by `db execute` + `migrate resolve --applied` because the local development database carries pre-existing drift (`20260729162228_add_cases_travel_policies` modified after being applied) and `migrate dev` wanted a full reset. The migration file is ordinary and applies cleanly to a fresh database, so staging is unaffected — but the drift remains and the next `migrate dev` meets the same wall. `pnpm prisma:clean` squashes it.

**Phase 2 remaining:** local-LLM default + per-tenant provider policy (§6.15, still the live offshore exposure — scheduled week of 10 Aug 2026); policy file feed (gated on G9); the insurer-side MI reporting surface (the `monitorOnly` clocks already measure it).

### Claimant anonymisation — the last PDPA PARTIAL (6 Aug 2026)

PD 12.8 wants the adjusting record for seven years; PDPA s.10(2) wants personal data gone once its purpose ends. Anonymisation is how both hold at once: the firm keeps what it did and stops holding who it was done to. §3.4's retention row moves from PARTIAL to PASS.

**Anonymisation, not pseudonymisation.** A reversible transform is still personal data and PDPA still applies to it, so every replacement is **random, never derived**. Hashing a phone number would be reversible by brute force — Malaysian mobiles are a few hundred million candidates, which is minutes of compute. The NRIC **blind index** is destroyed too, and it is the vector that matters most: an HMAC survives the plaintext being destroyed and still matches any future NRIC put through the same pepper. `nricLast4` goes for the same reason — four digits with a date of birth usually identifies one person.

**What survives:** the claimant row, its timestamps and tenant. Claims still resolve, and the PD 12.8 record the retention period exists to protect stays coherent. Deleting the row outright would orphan claims and destroy the thing being retained.

**Eligibility is over every claim naming the person, not the latest.** Someone with a ten-year-old settled claim and one opened last week is a live claimant; anonymising them would destroy the identity the open claim depends on. One open or held claim keeps the whole person, and a legal hold is checked before the arithmetic because it outranks the calendar. A policy row shorter than seven years cannot shorten retention below the floor.

**Placed in the gateway, not case-service.** `Claimant` is identity-context data, and the existing ownership exception's recorded resolution is that case-service *stops* writing identity — putting anonymisation there would have deepened the debt it exists to retire. The gateway reads claims to decide eligibility, which is a permitted cross-context read.

The audit row is written **before** the update: if the write succeeded and the audit failed, identity would be destroyed with no record of why — the one ordering that cannot be recovered from. It deliberately carries **no old values**, because copying the identity into an append-only seven-year trail would move the personal data rather than destroy it.

**Verified live, including the destructive path**, which a sweep over recent data alone cannot prove: a seeded claimant with a claim closed nine years ago was anonymised — name, blind index, NRIC tail and ciphertext all destroyed, phone replaced with a random token — while its claim survived with number and status intact. The other eleven claimants were correctly kept. 15 tests.

### Per-tenant configuration surface (6 Aug 2026)

`Tenant.settings` was free-form JSON, which is how it came to hold nothing at all while the behaviour it was meant to drive stayed hardcoded or absent (§4.2). It is now a validated surface with a screen: licensed mode, working-day calendar state, fast-track categories and per-category ceilings, and white-label branding name.

**Every default fails closed.** Absent settings mean unregistered, no fast track, and Kuala Lumpur's calendar. A missing flag must never enable a control the firm is not authorised to operate under, nor a shortcut it has not chosen. A malformed ceiling is **dropped rather than defaulted** — the category is then refused the fast track, which is the same outcome as never configuring it and the safe reading of a typo.

**Flipping `licensedMode` requires a stated reason.** It turns advisory compliance checks into blocking ones across sign-off, competency and conflicts, so it is not a preference and the service refuses the change without one. The reason lands on the audit row alongside the before and after; the screen states the consequence next to the switch rather than hiding it in a tooltip.

**Patches merge rather than replace**, so a screen editing fast-track limits cannot silently clear registered status because it did not send it. Only the touched keys are audited — recording the whole object each time would bury the one field that changed.

**Validation is at the boundary and specific.** Calendar state is checked against the states the SLA engine knows, because four of them observe a Friday–Saturday weekend and a typo silently computes deadlines against the wrong one. Ceilings are decimal strings, not JSON numbers: the threshold turns on equality at the boundary, and RM5,000.00 exactly is inside the limit.

**The data-ownership ratchet caught a real placement error.** The service was first written into case-service, and the test refused it: `Tenant` belongs to the **identity** context, which the gateway owns. It was moved to the gateway, where tenant writes already live. case-service still *reads* the settings — cross-context reads are permitted; it is the writes that need one owner. This is the second time the ratchet has paid for itself, and the first where it prevented rather than recorded a violation.

**Verified live:** reading returns the effective configuration with defaults made explicit; a `licensedMode` change without a reason is refused with the reason why; a fast-track patch merged without disturbing licensed mode; and the assessment-mode router immediately routed a real claim against the newly-configured TRAVEL policy. 14 settings tests, 336 in case-service.

### Assessment-mode router and the small-claims fast-track (6 Aug 2026)

The §2.4 design, built. It was the largest gap between what the flow diagrams promised and what ran — and the one the diagram audit caught being drawn as live when it did not exist at all.

**The mode is a disclosable method, not an internal optimisation.** PD 12.6 requires the report to disclose the *methods* behind an assessment, and "desk review on documents alone" and "site inspection" reach the same figure by different means. Every decision therefore returns its **reasons**, they are stored on the decision row rather than recomputed, and the report's methodology section is pre-filled from them. A firm that raises its fast-track ceiling next year must not thereby restate why a claim was fast-tracked last year.

**Four conditions, each necessary.** Category on the firm's list; estimated amount within the per-category ceiling; no open fraud signal at MEDIUM or above; evidence checklist complete. All four are tested independently, and the router returns *every* failing reason rather than the first — an adjuster clearing one blocker should not discover the next only after fixing it.

**Configuration gaps fail closed.** A category listed with no limit is not fast-tracked, an unknown estimated amount is not treated as a small one, and a malformed ceiling is dropped rather than defaulted. Each would otherwise let a claim skip an interview by passing a test against nothing. **Medical is excluded ahead of the economic checks**, so a small medical claim cannot slip through on value — the §1 rule holds regardless of size.

**Escalation moves one level.** A fraud signal on a desk review goes to video, not straight to a site visit: the §2.5 COGS ceiling is what makes attempting the cheaper step worth it, and jumping levels spends the budget the ladder exists to protect. At the top it returns `changed: false` rather than writing an audit row describing a decision nobody made.

Re-deciding with the same result records nothing, so the history stays informative rather than merely long.

**Verified live**, not only in tests: the router run against a real travel claim correctly identified it as medical and returned `EXPERT_REFERRAL` with its reason, persisted the decision, updated the claim cursor and wrote the audit row; a second identical decide left the history at one row; and escalation at the top of the ladder refused to manufacture a change. 22 router tests, 336 across the service.

### The operator slice — three backends acquire a user (6 Aug 2026)

FNOL ingestion, notifications and quantum had all shipped as correct, tested backends with **no screen**. An operator queue nobody can see is functionally the same as one that does not exist, so this closes that for two of the three and fixes a gap the quantum work left behind.

**The report now cites a quantum worksheet revision.** The previous entry claimed quantum was wired into the report; it was not — the template had a `quantum` section key and an adjuster still typed the figure by hand, so the report and its workings could disagree. Creating a report now pre-fills that section from the current worksheet and stores `quantumWorksheetId`. Rendering reads the **cited** revision rather than recomputing, so a later correction to the calculator cannot restate a figure already issued. A draft citing a superseded revision reports `quantumOutdated`; refreshing is draft-only, because once a report is in review its quantum is part of what was attested to, and a changed figure after that is a new report superseding this one.

**Gateway proxies for quantum and ingestion.** Both case-service modules sit behind `InternalAuthGuard`, so the portal could not reach them at all — the endpoints existed and were unreachable. Role gating stays downstream so it has one home rather than two that drift.

**Two screens.** *FNOL intake* lists inbound email with `NEEDS_REVIEW` and `FAILED` leading the filters rather than sitting behind a default "all" view, shows the deterministic parse result and why it failed, and offers retry and dismiss. The *Quantum* panel sits beside the financials it supersedes on claim detail, renders the worksheet as an adjuster reads it, surfaces warnings as "matters outstanding", and lists the revision history. Money is typed and submitted as **text** throughout — `<input type="number">` coerces to a float, and this is the one screen where a rounding artefact becomes a figure in a report.

**Verified end to end, not by inspection:** the worked example posted through the portal's own path — portal → gateway → case-service → calculator → database — returned **RM29,000.00** with average applied at 60%, and both screens were driven in a browser.

### Quantum worksheet (6 Aug 2026)

How a loss becomes a recommended figure — **prod for fire and property**, demonstrable for other lines. The calculator is a pure function, so the rules are exercised in CI without a database, and the ordering is documented in the code because it *is* the domain rather than a preference.

**The order is domain law, not configuration.** Two placements change the answer materially:

- **Average is applied before the excess.** Underinsurance reduces the loss proportionally and the excess is then taken from the reduced figure. Deducting the excess first would shrink it by the same proportion: on the worked example in the tests — a RM50,000 loss, RM150,000 declared against RM250,000 at risk, RM1,000 excess — the correct figure is **RM29,000** and the wrong order pays **RM29,400**, so the insured bears only 60% of their own excess.
- **The sum insured caps last**, because it limits what the policy pays rather than feeding the arithmetic.

**Depreciation and betterment are distinct deductions**, not synonyms — one converts a reinstatement cost to an indemnity value, the other charges the insured for being left better off than before. Supplying depreciation on a reinstatement policy is **refused rather than ignored**, because it almost always means the settlement basis was recorded wrongly and silently dropping it would hide that.

**Nothing is applied silently.** Average with no value at risk assessed produces a warning that underinsurance *could not be tested* — unknown, not absent. Underinsurance on a policy carrying no average condition also warns, because the insurer may want to know the risk was underdeclared even where it costs them nothing. **Decided 6 Aug:** where the policy carries the condition and the numbers show underinsurance, average **is applied** and reported with its ratio in the workings, rather than left advisory — consistency across adjusters was judged to matter more than pre-empting a negotiation the insurer may waive. No additional sign-off gate was added: the report already requires an adjusting employee to sign and registered mode requires a countersign, and duplicating that control would add friction without adding assurance.

`QuantumWorksheet` stores **both the inputs and the computed lines**, which looks redundant and is not: the inputs let the figure be re-derived when an insured disputes it, and the stored lines record what was actually recommended at the time — a later correction to the calculator must not silently restate a figure already issued to an insurer under PD 12.6. Worksheets are **superseded, never edited**, for the same reason an issued report is immutable.

Money is carried as a decimal string over the wire and `Prisma.Decimal` throughout. A JSON number is an IEEE-754 double, and quantum is the one place where a rounding artefact becomes a sum of money in a report.

**Verified:** 18 calculator tests, 314 across the service, routes live. The tests caught a real error while being written — my own worked example was wrong and the calculator was right, which is the argument for worked examples over assertions on round numbers.

### Notifications — three obligations that were being discharged by remembering (5 Aug 2026)

Deferred on 31 July for a stated reason — nothing was deployed and no provider was chosen — and un-deferred once staging settled both. Built against SES `ap-southeast-5`, and against Mailhog locally, which are the same SMTP path with different configuration.

`NotificationTransport` sits behind a token, the fourth instance of the plugin pattern already used for `LlmProvider`, `SignatureProvider` and `InboundMailSource`; SMS and WhatsApp become implementations rather than rewrites. Templates are a **code registry, not a table** — the same reasoning as the PD 12.6 report sections: what the firm told a claimant and when is evidence, and evidence whose wording can be changed by an UPDATE statement is worth less than evidence that cannot. Each template declares its own input type with no `Record<string, unknown>` escape hatch, so an NRIC or a bank account **cannot compile** into an email. Fourteen tests assert that, including a schema-reading test that fails if a `body` column is ever added to the delivery log.

What changed in practice:

- **The CSP one-working-day acknowledgement is now sent**, not merely recorded. Acknowledging emails the appointing contact and stops the clock in the same act.
- **A claimant asked for a document is now told.** Until this, an operator could move a case to `INFO_REQUESTED` and the claimant would never hear — the case simply stopped while the firm's own clock kept running against it.
- **SLA breach escalation reaches a person.** It had persisted a `ComplianceEvent` row and logged a warning: recorded evidence, not an alert. Deduplicated per clock and per level, because the sweep re-evaluates every fifteen minutes and a breach left open over a weekend would otherwise send hundreds. Insurer-side `monitorOnly` stages send nothing — they are measured, never escalated against the firm.

`NotificationLog` is the delivery record, and the point of the table rather than a convenience: "we notified them" is a claim that needs a timestamp against it. It deliberately does **not** store the rendered body — templates are keyed and live in code, so what was said is reconstructable without putting claimant-facing prose in a plain column the encryption work never reached. `SUPPRESSED` is a real status: no address on file, or notifications off in this environment, recorded rather than skipped, because "nothing happened" and "we chose not to" look identical afterwards otherwise.

Sending is **fail-soft by construction**. Every caller is mid-way through something more important — acknowledging an appointment, escalating a breach — and `enqueue` never throws; failures log loudly, the same posture as `raiseQuietly`. Verified end to end against the local Mailhog: message composed, sent, and retrieved from the inbox.

### User-flow diagrams, and the defect drawing them exposed (5 Aug 2026, `8854d43` · `dd1c159` · `98bfc6d`)

`docs/USER_FLOWS.md` holds eleven Mermaid diagrams covering intake through to fee note, with a static site in `docs/sites/user-flow/` for Vercel. The state machines are transcribed from `CASE_STATUS_TRANSITIONS`, `CLAIM_STATUS_TRANSITIONS` and the Prisma enums rather than drawn from intent, so a diagram disagreeing with the server is a defect in one of them.

**Transcribing them found a real defect.** `CLAIM_STATUS_TRANSITIONS` listed `CANCELLED` as a target of `SCHEDULED` and as a key of its own, but `ClaimStatus` has no such member — the table was typed `Record<string, string[]>`, so nothing checked it against the enum. The guard would have permitted the transition and Postgres would then have rejected the write: a database error where a 400 belongs. Never reachable in practice, so removing it changed no behaviour. The table is now `Record<ClaimStatus, ClaimStatus[]>`, which also forced the three statuses with no entry (`DOCUMENTS_PENDING`, `PENDING_ASSIGNMENT`, `UNDER_REVIEW`) to be declared rather than falling back to `[]` — "unreachable" and "deliberately terminal" had read identically at the call site. The neighbouring Case machine has no equivalent defects precisely because it was already typed against its enum.

That tightening exposed a second gap: `PATCH /claims/:id/status` took `@Body('status') status: string` with **no DTO** on both case-service and the gateway, and was safe only because the `|| []` fallback refused unrecognised values as invalid *transitions*. Both endpoints now take an `@IsEnum(ClaimStatus)` DTO.

**A diagram audit against the code found the reverse problem too** — flows drawn as live that do not exist. The **assessment-mode router and small-claims fast-track (§2.4)** appeared in diagram 1 as step 4 of the journey and in diagram 10 in full, unmarked; there is no `AssessmentMode` field, no routing logic, no tenant fast-track configuration anywhere in the repository. Both are now dashed with explicit warnings and listed in the document's own "not yet built" table, alongside assignment acknowledgement (a real state change, but sent by hand until notifications exist).

The lesson is the §3.6 one again, from the other direction: a flow diagram is persuasive **because** it reads as a specification, so an unmarked planned step is more dangerous there than in prose. Both copies were verified by rendering them in a browser — including a harness built from the markdown's own diagram source — after two earlier attempts were shipped on inspection alone and both were wrong.

### Screenshot audit fixes, and the crash hiding behind a nullish check (6 Aug 2026)

Reading the seeded book as an insurer would, rather than as its author, found four
defects on one screen.

**The claim page offered the wrong action.** "Start Live Session — notifies
claimant via SMS" sat on every claim an adjuster could touch, including a
*closed* fire claim routed to a site visit. The Session card is now an Assessment
card: it names the mode the router chose and offers the video controls only where
video is the method, saying what will happen instead where it is not, and
treating `CLOSED` as settled alongside `APPROVED`/`REJECTED`. `AssessmentMode`
and its labels moved into `@tci/shared-types`, since the portal was reading a
field the shared `Claim` interface did not declare.

**The claims-list `Type` column read `—` on every row.** `Claim.claimType` is a
motor enum and the book is non-motor, so the column had nothing to render. It now
shows the travel subtype where there is one and the category otherwise; the list
query selects `travelClaim.travelClaimType`, which it previously did not fetch at
all.

**Every claim without a quantum worksheet crashed its own page.** The gateway
proxies unwrapped downstream responses with `response.data?.data ?? response.data`
— correct until the payload is legitimately `null`, when `??` treats "no
worksheet" as "no payload" and returns the envelope. `QuantumWorksheetPanel` then
read `.lines` off `{success, data, meta}` and took the whole claim page down
through the error boundary. Replaced by `unwrapEnvelope()`, which decides on the
envelope's *shape* rather than its contents, applied at all six proxy call sites
and covered by ten tests. The failing case is the common one: most claims have no
worksheet.

**Two seeded-data contradictions.** 76 travel claims were routed to `SITE_VISIT`
— a travel loss happens overseas and has no risk address to inspect. And the
policy excess was drawn twice, once for the claim and again for the worksheet, so
125 worksheets deducted an excess the Policy Information panel beside them
reported as nil; 617 worksheets were rebuilt from the claim's excess with their
recommended figures and approved amounts recomputed. Both are fixed in
`seed-volume.ts` and backfilled, so no re-seed was needed.

### The last three steps of the flow, and the clock that could not be discharged (6 Aug 2026)

Steps 6, 7 and 8 — report, handback, fee note — had engines and no way to
reach them. All three now have screens, and building them found two defects
worth more than the screens.

**The fee note was unreachable, not merely unbuilt.** There was no billing
module at the gateway at all, so every route 404'd from outside case-service.
Added, along with the read route the engine never had. Two seeded facts had to
be true first: only 7 of 980 claims recorded an insurer to bill, and the book
sat under the wrong one — the seed picked "the first insurer" while writing
MSIG-numbered policies, so 867 MSIG policies were under Allianz and five claims
named the adjusting firm as their own insurer.

**A breached SLA clock could never be discharged.** `stopFor` looked only at
RUNNING and PAUSED, so issuing a report late left `stoppedAt` null for good and
the record could not distinguish *late but delivered* from *still outstanding* —
the first question an insurer asks about a breach. BREACHED is now stoppable and
the breach survives being discharged, because it is history. The panel says
which it is.

**The report screen respects that this is a regulated document**: each section
shows the PD paragraph it discharges, AI assistance is declared per section
rather than per report (§6), submit names the mandatory sections still blank,
sign-off and issue are separate acts, and an issued report renders read-only.
Authorship is refused to a firm admin, which is correct — it is an adjusting
employee's act under PD 12.7.

~~**Also found, not fixed:** identity is recorded and never enforced. Nothing
refuses a report or a decision on an unverified claimant, and **225 seeded
claims are decided or reported on one**. eKYC needs the provider *and* a
decision about what it should block.~~ *Closed 6 Aug (`6633a38`), recorded 10
Aug: REPORT_PENDING, APPROVED and REJECTED now refuse on an unverified claimant
in registered mode and record `IDENTITY_UNVERIFIED_AT_DECISION` as a TPA — the
licence-flip shape. Verification is an audited operator act with a mandatory
basis (what was examined, by whom); automated eKYC remains future. See the 10
Aug audit entry.*

### The final-report clock was four days tighter than the law requires (6 Aug 2026)

`SlaPolicy.FINAL_REPORT` ran **10 working days**. That is the CSP figure for
**motor**; paragraph 10.13 allows **14 for non-motor**, and this book is
non-motor by standing decision. Not a breach — stricter than the ceiling — but
it meant a breach report could not distinguish *we missed our own promise* from
*we missed the regulation*, which are different conversations with an insurer.

The ceilings now live in `@tci/shared-types` as `CSP_ADJUSTING_WORKING_DAYS`,
cited to the paragraph, with `csp-timelines.spec.ts` as a tripwire: if that test
fails the answer is to re-read 10.13, never to update the expectation. The seed
reads the constant rather than a literal.

Correcting the target exposed three false readings in the seeded clocks, all
now fixed: **54 of 81 "breaches" were only breaches against the old 10-day
target**; **35 claims referred to SIU had live or breached clocks** although
`SLA_TRANSITIONS[ESCALATED_SIU]` pauses the reporting obligation — the firm
cannot write a report while an investigation it does not control is running;
and **21 claims at REPORT_PENDING showed a clock already `MET`**, recording that
the firm met a deadline for a report it had not issued. Genuine overdue work is
now 35 claims, not 81.

Also corrected here: the §3.2 re-audit note still said the final-report row was
PARTIAL because the clock anchored on `REPORT_PENDING`. `refreshDocumentsComplete`
has since made `documentsCompleteAt` the anchor, which is what the row itself
records — the note was stale, not the row.

**A question worth having asked.** Checking the source settled a larger one: the
CSP **binds time, not method**. It contemplates "desktop assessment and/or field
inspection" (footnote 2) and qualifies field inspection as "where applicable"
(footnote 22). No Malaysian requirement compels a video interview on any line;
every mandatory *physical* inspection in the PD is motor-specific (10.12 above
65% of sum insured, 10.16, 10.17). PIAM's inspection requirement is a **PARS
workshop-accreditation** matter and does not reach non-motor claim method. So
the desk-review fast track in §2.4 is a compliant choice rather than a shortcut,
and the §2.5 COGS ceiling rests on firmer ground than it did.

**Still to verify:** the adjusters PD was reissued **29 August 2025 as
BNM/RH/PD 032-29**, superseding PD 032-27 of 1 June 2023. §3's paragraph
references (12.6, 12.7, 12.8, 11.2(d)) were numbered against the older document
and must be re-checked against the 2025 text before the matrix can be relied on.

### The four the audit deferred, closed the same day (6 Aug 2026)

**The opening decision never attended a loss.** Fixed in §2.4 above, with a
per-tenant inspection policy, nine tests, and the seed reconfigured to route from
the firm's own policy instead of drawing modes at random. Verified against the
running data: the real router, reading the real tenant row, now agrees with the
stored mode on every sampled claim — property above RM20,000 to `SITE_VISIT`,
below it to `VIDEO`, small travel to `DESK_REVIEW`, medical to
`EXPERT_REFERRAL`. Correction: an earlier note here said `SITE_VISIT` was
unreachable; escalation always reached it, and only the opening decision did not.

**Approve and Reject stayed live on a closed claim.** The state machine permits
`CLOSED → IN_ASSESSMENT` and nothing else, so the buttons offered an action the
server was certain to refuse. The portal had the rule written out four times as
`status !== APPROVED && status !== REJECTED`. It is now one named thing,
`canDecideClaim` in `@tci/shared-types`, and `claim-transitions.spec.ts` asserts
it agrees with `CLAIM_STATUS_TRANSITIONS` for every status — the table stays the
authority, typed against the Prisma enum, and the duplicate cannot drift silently.
`CLOSED` is excluded deliberately: reopening runs through the supplementary
endpoint so the CSP five-working-day clock starts.

**Every travel claim was seeded the flight-delay document set.** A luggage claim
carried a boarding pass and an airline delay confirmation while its checklist
asked for a PIR, a baggage tag and a damage photo — which is why it read 0/3. The
seed now resolves evidence from `evidence_requirements`, the same table the
checklist reads, so the two cannot describe different claims. 990 claim documents
and 920 case documents were replaced; 606 of 614 travel claims now read complete,
the remaining 8 deliberately short of one item so the chase-up queue is not empty.
Property lines have no rows in that table yet and keep their hand-written lists.

**Travel claims rendered a blank Location.** The field read `.address`, which a
travel loss has never had — the incident is a destination abroad. `Location` now
declares the shape it actually arrives in, `describeLocation` renders whichever
is present, and the label reads *Destination* on travel claims.

Still open, seen while verifying: travel worksheets carry a `REINSTATEMENT`
settlement basis, which is a property concept — a lost bag is indemnified, not
reinstated.

### Intake flows became data, and Telegram became a channel — 6 Aug 2026

**Why.** The five travel intake flows lived in `packages/shared-types/src/case-flows.ts`
as hardcoded TypeScript, one of them branching through a JS closure. That is
unauthorable — a closure cannot be stored in a column or edited in a form — so a
wording change meant a code edit, a PR and a deploy of three packages. It also
made a second conversational channel impossible without forking the flow.

**Flow authoring.** `FlowStep.next` is now a serialisable `NextRule` union
(`step` / `end` / `branch` / `switch`); the single closure is a `branch` row in
Postgres. `FlowDefinition` holds versioned structure, tenant-scoped with
`tenantId = null` as the platform default; `FlowOverlay` holds sparse per-channel
and per-locale *wording only* — it has no `next` and no `answerType`, so a channel
cannot diverge into asking different questions. That guarantee is in the shape of
the data, not in a rule a later bulk-import tool could bypass. Locale outranks
channel in the resolver: wrong tone is cosmetic, wrong language is a
comprehension failure and PDPA s.7 treats it as substantive.

Steps the rest of the system reads by name are marked `system: true`
(`incident-date` drives the CSP deadline flags, `trip-start` is promoted to
`Claim.tripStartDate`, `bank-account-number` keys the redaction set). The publish
gate refuses a flow that dropped one — otherwise the conversation still runs, the
claim still looks healthy, and a regulatory clock silently stops being computed.

`Case.flowDefinitionId` + `flowVersion` pin the version at creation, so
publishing an edit cannot rewrite an intake already in flight. Overlays are
deliberately *not* versioned: because they carry only copy, they cannot move
`currentStepId` or invalidate an answer, so wording is safe to correct live.

**Telegram.** `ConversationBinding` binds a chat id to a Claimant; nothing about
a claim is served before OTP verification. `InboundTurn` is written insert-first
on `(channel, platformMessageId)`, so a unique violation *is* the "already seen"
branch — the same arbitration as FNOL email, and necessary because every platform
retries delivery. Answers route through `CasesService.patchAnswer`, not a second
write path: that keeps redaction, policy promotion, deadline warnings and the
audit row, and it means `assertAccess` proves a Telegram sender cannot reach
another claimant's case. Long-polling ingress, so no public surface exists and
local development needs no tunnel.

**Verified.** 439 tests across 35 suites (56 new); all seven TypeScript packages
typecheck; two migrations applied and tables confirmed; the five flows seeded as
`PUBLISHED` platform defaults through the publish gate, idempotent on re-run; the
service boots with the chat module resolved and polls the live bot.

**Open, and known.** Telegram long-polling is a fleet-wide singleton — two
pollers on one token each receive *half* the updates, which presents as claimants
being intermittently ignored rather than as an outage. `TELEGRAM_POLLING_ENABLED`
guards it; staging needs its own bot or the flag set. There is no flow editor UI
yet (the models and publish gate exist to support one, SUPER_ADMIN only).

### Conversations inbox and human takeover — 6 Aug 2026

**Why.** A bot that cannot be watched cannot be improved, and a claimant who
asks for a person must reach one. Both reduce to a question the data had to be
able to answer — *who said this?* — and it could not: only inbound messages were
stored, so a transcript would have shown a claimant talking to nobody.

**Model.** `InboundTurn` became `ConversationMessage` carrying both directions,
because a transcript is one ordered list and two tables would mean a merge-sort
on every read. Inbound idempotency survives as a **partial** unique index
(`WHERE platformMessageId IS NOT NULL`) — outbound rows legitimately have no
platform id, and Postgres treats every NULL as distinct, so a plain unique index
would not have held. Zero rows existed, so this was a rename rather than a
second table bolted alongside.

`sentByUserId` is null for the bot and set for an agent. That one nullable
column is the feature: without it the machine's words and a human's are
indistinguishable after the fact, and "the bot handled 200 conversations" is
unfalsifiable.

**Outbound** is persisted through a single `say()` funnel rather than a write at
each of the fifteen send sites — the one that gets forgotten is invisible, since
the claimant sees the message and the transcript does not.

**Handover.** `ConversationMode.BOT | HANDOVER` on the binding. In handover the
gateway records the inbound message as `AWAITING_AGENT` and sends nothing
automated, so the bot cannot answer over an agent or overwrite a correction.
`takeOver.reason` is **required**: a count of handovers is a metric, a column of
reasons is a backlog.

**Built rather than integrated**, deliberately. An external CRM would put claim
content offshore — a materially larger transfer than the message text Telegram
already sees, against a §3.4 position that is PARTIAL with no basis established —
and no generic inbox knows what a Case, an evidence checklist or a deadline flag
is, which is exactly the context an agent needs beside the thread.

**Verified.** 444 tests across 35 suites; all six TypeScript packages typecheck;
migration applied with the partial index confirmed in Postgres; case-service and
api-gateway both boot with all four routes mapped; the gateway proxy returns 401
without a token; the portal builds.

**Open.** Unverified bindings are invisible in the inbox by design (they carry no
tenantId until OTP passes, so showing them would leak a phone number across
tenants) — a "stuck at verification" view for support needs its own design. No
canned replies, no assignment queue, no per-agent reporting.

### An LLM joins the intake path, as a normaliser only — 6 Aug 2026

**Why.** A live Telegram test exposed the cost of a purely deterministic
conversation: the bot asked for `DD/MM/YYYY`, the claimant sent exactly that,
and the shared validator rejected it — `new Date()` reads a slash date
month-first. The visible half was a loop. The silent half was worse:
`06/07/2026` *parsed* as 7 June when a Malaysian writing day-first meant 6 July,
which moves the CSP deadline flags with nothing to see. Both halves are now
fixed deterministically (`parseTextDate`; the validator refuses slash dates
outright), and 11 tests hold it.

But the shape recurs — amounts, flight numbers, destinations all have it — so
the question of a language layer was put properly rather than left implicit.

**Position taken.** Research across FNOL-specific and general sources converges
on one pattern for regulated intake: *the model is the language layer, the rule
engine is the control plane*. Our state machine was already the recommended
shape, by inheritance rather than decision. What was missing was only the
language layer, so that is all that was added.

`AnswerNormaliserService` (risk-engine) turns one message into one value.
Fallback-only — a deterministic parse is always tried first, so most turns never
reach a model. The value returned passes the same `validateAnswer` as a typed
answer, and a choice value that was not offered is rejected before it leaves the
service. The model never sees the flow, never chooses the next question, never
writes to a Case. Off by default (`CHAT_LLM_NORMALISER_ENABLED`).

**Placed in risk-engine deliberately.** Every offshore model call must write a
`TransferRecord`, and `transferRecord` belongs to the assessment context, which
only risk-engine may write. case-service calls it behind an `AnswerNormaliser`
port over the internal channel — the same shape as the OTP port, and the seam
the in-country model will bind to.

**Verified.** 460 tests across 36 suites; five packages typecheck. Three of the
seven new tests assert what the model *cannot* do: it is not consulted when
deterministic parsing succeeded, it is skipped entirely when disabled, and a
value it returns that still fails validation is discarded.

**Open, and now recorded as §6.18 and §6.19.** A lawful basis for this path
(none established). Counsel on FSA 2013 secrecy over model inputs, which BNM's
August 2025 discussion paper raises directly. And the AI-scope assessment — the
intake conversation was plausibly outside AI-governance scope while purely
rule-based, a position held by accident and never written down; adding the
normaliser spends part of it, and what remains defensible should be documented
before a vendor assessment asks.

**Constraint for now: synthetic and internal-tester data only on this path.**

### Claimant conversational intake — audited and remediated, 10–11 August 2026

A four-way audit of the claimant Telegram channel (transport, flow engine,
security, documentation) produced a tiered work queue large enough to warrant
its own temporary file. **That queue is now empty and the file is deleted** —
all six tiers closed and verified against the original reports, which caught
three findings that had survived two earlier passes: `edited_message` was never
in `allowed_updates` so correcting a typo met silence; only the *future* half
of the date-range check had been fixed, so `1026` for `2026` arrived
pre-marked out of window; and five gateway routes carried
`@Throttle({ default: … })` against a config defining only `short`/`medium`/
`long`, so the tightest limits in the system — five OTP sends an hour, ten
logins a minute — had never applied to anything. A source-scanning test now
fails on a `@Throttle` naming a throttler that does not exist, in both
services.

**A claimant can complete an intake end to end on all five flows**, and an
operator can take over, read the transcript and open the evidence. The channel
remains on **synthetic and internal-tester data only**, because that is a
§3.4 constraint rather than a defect backlog: transfer records are written for
every turn but carry `lawfulBasis: null`, no s.129 basis having been
established.

Operating notes — the environment flags, and above all that
`TELEGRAM_POLLING_ENABLED` must be true on exactly one instance per bot token —
now live in `docs/NON_MOTOR_ARCHITECTURE.md` under "Operating the
conversational channels". Two pollers each receive half the updates, which
presents as claimants being intermittently ignored rather than as an outage.

Two findings reach beyond the channel and belong here:

- ~~**The payout bank account is destroyed one turn after it is captured, on
  every channel.**~~ **Fixed 11 Aug.** `patchAnswer` re-derived the encrypted
  column from the already-masked answer bag, so the following turn encrypted
  `••••4567` over the real ciphertext. `bankAccountLast4` still read correctly,
  so every operator screen and the audited firm-admin reveal looked right while
  returning a mask — the encryption of standing decision 4 protecting nothing.
  A sensitive answer is now promoted only on the turn that supplies it, with
  redaction and promotion sharing one predicate because their disagreement is
  what destroyed the data. **Measured before the fix: 5 of 7 stored payout
  accounts on the demo book held only their own mask, and are unrecoverable —
  the plaintext lives solely in that column.** Verified after: the account
  survives the following turn on the live system.
- ~~**Nothing writes a Telegram `TransferRecord`.**~~ **Fixed 11 Aug.** The
  registry entry added on 10 Aug and its passing test made the control look
  present while no writer was instantiated in `chat/` — a §3.6 false comfort of
  exactly the kind this document tracks. Every turn now writes one. They carry
  `lawfulBasis: null`, which is the honest state: the register records the
  transfer and records that no s.129 basis exists for it, rather than implying
  one by omission.

Method note worth keeping: the two defects fixed on 11 August — a transcript
that recorded no tapped answer, and case evidence with no read path at all —
were both found by a person using the screen, *after* four auditors had read
the same code closely. An audit narrows the search; it does not replace using
the thing.

### One intake engine, and a console to work it — 11 August 2026

Twenty-six commits; the material ones below. Two are defects this document's
own §3.6 pattern predicts — a control that reads as present and is not.

- **A confirmed claim was not being submitted** (`d697389`). The review step is
  recognised by an `isReview` flag added to the definitions *in code*, but a
  Case walks the flow version it pinned, loaded from the database, and all five
  published rows predate the flag. So the review step was not a review: the
  answer summary was never attached — the claimant confirming details the
  message did not contain — and confirming filed nothing, handing the finished
  claim to an agent as "ran out of steps". CSE-2026-000021 submitted at 02:24;
  CSE-2026-000022, identical flow, did not at 04:42. **A partial migration:
  a semantically required field added to persisted data with no backfill.**
  Repaired on the single load path, rows backfilled, and the publish gate now
  requires exactly one review step.
- **Nobody's name was on the claim** (`de124f2`). A messaging claimant is
  created from a verified phone alone; the policy number is optional and was
  skipped or unmatched on all eight Telegram cases; no eKYC vendor is
  integrated. `Claimant.fullName` was null and the only name anywhere was the
  payout account holder — not necessarily the same person. Nothing for AMLA
  screening (gate G8) to screen, and no way to recognise a repeat claimant.
  `claimant-name` is now the first question. **Left in plaintext, deliberately:**
  `Claimant` stores phone, email and date of birth in the clear and encrypts
  only NRIC, so encrypting the name alone adds a decrypt path to every screen
  while the row stays trivially identifiable. Encrypting Claimant PII properly
  — name, email, DOB, and phone behind a blind index like `nricHash` — is its
  own change, and **now more pressing, because names accumulate from today.**
- **Answers were only ever validated alone** (`de124f2`). A trip ending before
  it began, an incident years outside the travel window, a flight "delayed" to
  before its scheduled time: each field passed on its own, so all three reached
  an adjuster as a clean claim. None needs conversational understanding to
  catch — they are rules. Held in code keyed by step id, *not* as fields on
  `FlowStep`, precisely because of the `isReview` lesson above: a new step field
  reaches nothing already published. Incident timing is per claim type, since on
  a cancellation the incident precedes the trip by definition.
- **The PWA became a channel rather than a second implementation**
  (`10aa844`, `68bba69`). See `NON_MOTOR_ARCHITECTURE.md` for the design. 491
  lines of browser-side flow logic deleted; the claimant app gains transcript,
  `back`/`edit`, progress counts and a route to a human that web claimants
  never had.
- **The console became somewhere a team can work** (`bdd9aa8`, `2e08a4c`) —
  assignment to colleagues, an explicit queue status distinct from "is the bot
  talking", internal notes, and first-response timing. The queue's
  waiting-for-a-human count also never came back down: only `reply` cleared it,
  so handing a conversation back left a badge on for ever (`7220bf9`).
- **The review summary printed raw ISO timestamps** (`062cca5`) — the one
  moment a claimant is asked to check the facts of their own claim, and
  confirming it is what files the claim.

**AI summarisation and suggested replies are not built, and the reason is
§3.4, not effort.** They are table stakes in every 2026 support console
surveyed; every provider available is offshore, and sending claim content to
one is a materially larger transfer than the message text Telegram already
sees. This waits on the in-country model.

### The name was collected and then not shown — 11 August 2026 (`2e08a4c`, `a47e9c2`)

Found by looking at CSE-2026-000024, a Telegram luggage claim, on the screen an
adjuster actually uses. Two things the page got wrong, with different causes.

- **The claimant read "Unknown" while their name sat two inches away.** The
  entry above made `claimant-name` the first question, and the answer was
  there — `Leo Boey`, in `Case.answers`. But `convertToClaim()` promotes it to
  `Claimant.fullName` only at conversion, guarded by `where: { fullName: null }`
  so free text typed into a chat can never overwrite a better-verified name from
  eKYC or a staff-entered record. That rule is right and is untouched. The
  *display* was wrong: the panel read only the identity column, so a case under
  review showed no name at all. It now falls back to the intake answer, labelled
  **"Stated at intake · not verified"** — the distinction between what a claimant
  asserted and what anyone checked is exactly what must not be lost, and showing
  it plainly would have implied an identity check that has not happened.
- **"Policy unmatched" was correct and was not a defect.** `PNT000008` matches
  none of the 423 policies on file, all of which are `MSIG-BGL-2026-#####`. Worth
  recording because the instinct is to fix the badge; the badge was the only
  honest thing on the card.

**A payee who is not the claimant is now surfaced** (`payee-name-check.ts`,
`a47e9c2`). The same case names `Leo Boey` as the claimant and `John Doe` as the
account holder, and nothing anywhere compared them — the divergence the entry
above predicted ("not necessarily the same person") had arrived and was passing
silently. Usually innocent: a parent, a spouse, a company card. Also the exact
shape of payout diversion and of a claim filed under a borrowed identity. So it
**warns and never blocks** — rejection stays a human decision (§3.2).

The comparison is deliberately three-valued. `match` silences the warning,
`mismatch` asserts a discrepancy, and `uncertain` exists so borderline pairs are
not forced into either: a false `mismatch` wastes an adjuster's time on an
ordinary family arrangement, and a false `match` waves through the thing the
check is for. Malaysian naming is why the middle value earns its place — banks
drop `bin`/`binti`/`a/p`, truncate the account-name field around 20 characters,
store uppercase, and Chinese name order is arbitrary. `Wong Chee Keong` against
`Wong Chi Kiong` returns `uncertain`, which is the honest answer. **24 tests.**

Pure, in `@tci/shared-types`, with no Prisma and no I/O, so the same rule can
gate conversion server-side later without the two copies drifting — the failure
mode §4.3 A2 is about. **Not yet wired to AMLA screening (gate G8):** this
surfaces the divergence to a human and screens nobody.

### A third channel, and a door claimants can actually open — 11 August 2026

**WhatsApp is a conversational channel** (`b63d573`), on the same engine as
Telegram and web chat. Identical flow — same gateway, same flow definitions,
same questions, same validation, same `back`/`edit`, same handover — because
the adapter knows only how to *say* things on one platform. Everything built
for the messaging side over the past week arrived here without being written
again, which is the whole return on the flow-as-data design.

It matters commercially more than Telegram does: WhatsApp is how Malaysia
messages, and reach on the intake channel is the constraint on volume, not
features.

Three platform differences that are not cosmetic:

- **Identity arrives free.** `wa_id` is on every inbound message and Meta
  vouches for it, so there is no "Share my number" step and no foreign-contact
  case. The claimant is bound, tenanted and verified on their first message —
  which is also what puts the thread in the operator queue. Verified against
  the queue's own query rather than reasoned about.
- **Choices are a ten-row interactive list.** Telegram holds around a hundred
  inline buttons, so pagination never fired there; it genuinely fires here.
- **A 24-hour service window.** Replies inside it are free-form and free of
  charge; outside it only an approved template may be sent, so a conversation
  left overnight cannot be reopened by us. Meta's 131047 is named explicitly in
  the error path, because the generic failure gives no hint and the fix is not
  a retry.

**Push, not poll**, which removes the Telegram footgun rather than repeating
it. No offset, no singleton constraint: every instance may receive deliveries
and the insert-first dedupe makes that safe. The webhook is public because Meta
is unauthenticated to us, so the `X-Hub-Signature-256` HMAC is the only control
on an endpoint whose payload names a claimant's phone number — with no app
secret set, every delivery is discarded rather than trusted.

Offshore, and recorded: a `WHATSAPP` entry joins `OFFSHORE_PROVIDERS`, content
reaches Meta in the United States and persists in WhatsApp's own history beyond
our retention sweep, and every turn writes a record with `lawfulBasis: null`.
The same §3.4 constraint as Telegram — synthetic and internal-tester data only.

**A claimant could not log into the PWA at all** (`b71db55`, `d436944`). The
web app's login sends an SMS OTP; there was no SMS provider, `sendOtp` printed
the code to the server console behind a `TODO`, and the universal dev code was
correctly removed on 10 Aug. So the offshore channel worked and the in-country
one — the only path crossing no border — was unreachable by any real person.
That inverts the residency story this plan had been telling, and it went
unnoticed because nobody had tried to log in.

Framed as the missing provider it is. `OtpTransport` joins the port pattern,
with a console implementation and a WhatsApp one. Outside production an
undelivered code is returned in the response so login works; **in production
the request fails**, because returning a live credential over HTTP to an
unauthenticated caller is indistinguishable from having no authentication. An
unset `NODE_ENV` counts as production. Verification itself is untouched — the
code is still CSPRNG-generated, stored, expiring, rate limited and
attempt-counted; only delivery was ever stubbed.

Register the WABA **in Malaysia**: authentication messages to Malaysian numbers
from an account registered elsewhere are billed at ~RM 0.1685 rather than
~RM 0.0564. One-tap and zero-tap autofill need a native Android package name
and signature hash, so a PWA gets copy-code — which is also the universally
supported option.

**Two smaller repairs.** The five payout ciphertexts holding only their own
display mask are cleared (`35a9ce0`), each with an audit row naming the defect
and stating the claimant must be asked again; `revealPayoutDetails` now
distinguishes "captured and lost" from "never captured", which are the same
blank field and call for opposite actions. And "Would you like to start another
claim?" now waits for the answer (`ab34282`) — it was asked and answered in the
same turn, so the claim-type menu arrived one second later and anyone messaging
to ask after the claim they had just filed was pushed into filing a second one.

### Every WhatsApp date was silently discarded — 13 August 2026

**The webhook verified a re-serialised copy of the body, not the bytes Meta
sent.** `verifySignature` hashed `JSON.stringify(body)`. Meta's backend is PHP,
whose `json_encode` escapes forward slashes: it sends `16\/06\/2026` where
`JSON.stringify` writes `16/06/2026`. Different bytes, different HMAC, delivery
discarded — and the endpoint answers `200` on a bad signature by design, so
nothing retried and nothing alarmed.

The shape of the damage is why it survived a day in front of a live tester.
Messages with no slash — a greeting, a name, a policy number — verified
normally, so the channel looked healthy. Every **date** failed, on a flow that
asks for `DD/MM/YYYY`. Intake could not pass the trip-start question at all: a
claimant answered it three times across two days and received nothing back.
Fixed by capturing `rawBody` at bootstrap and hashing those bytes, **failing
closed** when the raw body is absent rather than falling back to the old
comparison. Pinned by a test that signs a PHP-escaped payload. WhatsApp-only —
Telegram long-polls and carries no signature.

**A parse failure ended the conversation.** An unreadable date sent one error
bubble and returned, leaving the claimant with an apology, no question on
screen and nothing to do next. Every unreadable answer now ends with guidance
*and the question restated*; after three failures at one step it also offers a
way out (`skip` where the step allows, a person on request). Greetings are
recognised rather than parsed — "Hi" was being fed to the date parser and
answered with *"Sorry, we could not read that date"*.

**The deterministic parser now reads what people actually type**: months in
words including Malay (`16 Ogos 2026`), either word order, two-digit years,
spaces as separators, and `today`/`yesterday`/`semalam`. Day-first reading of
bare numeric dates is unchanged and still pinned — `06/07` is 6 July, and that
property is what the looser parsing must not cost.

**The LLM normaliser was unreachable from a date step.** It is invoked for
every other answer type, but the date branch returned before reaching it, so
the one place a human is most likely to write something no grammar covers was
the one place the fallback could not run — enabling the model changed nothing
for dates. Dates now fall through to it after deterministic parsing fails, and
its output is re-validated like any typed answer. **Note for §6.18:** this
widens what reaches Gemini to include free text typed at date steps. Same
ungated offshore path already recorded there, one more source feeding it.

**A completed WhatsApp claim could not be submitted.** With the dates flowing,
the tester reached the review — and stopped. The bot printed the full summary
and *"then confirm to submit your claim request"*, and offered nothing to
confirm with. `choicesFor` in the WhatsApp adapter renders buttons only for
`answerType === 'choice'`; the review is `'confirm'` and carries no `choices`,
so it fell through to plain text. The validator accepts only `true`, which
nothing could produce. Telegram had rendered a confirm keyboard since it was
built, so this was WhatsApp-only and invisible to anyone testing on Telegram.

Fixed both ways round: WhatsApp now sends reply buttons ("Confirm & submit" /
"Change something") attached to the **last** part of a split summary, and a
confirm step typed rather than tapped is accepted — "yes", "betul", "setuju"
and their refusals map to the same values the buttons carry. Taps stay the
happy path; the typed route is for the claimant who answers the sentence the
way a keyboard allows, or whose client renders no buttons.

These are channel and intake-quality repairs, not compliance movement; §3
verdicts are unchanged.

### A public web door into intake — 13 August 2026

**`/chat` opens straight into the conversation: no account, no login page.** The
web equivalent of messaging the WhatsApp number. Same `ConversationGateway`,
same flow, same transcript — the claimant PWA was not rewritten and its existing
pages were not touched.

The only real difference between the channels is who attests the phone number.
WhatsApp and Telegram have no login because the platform vouches for it; a
browser vouches for nothing, so the conversation asks for a number and proves it
with a code, delivered over the **same WhatsApp business account** the intake
channel already uses. `pendingPhone` and `otpAttempts` had been sitting on
`ConversationBinding` since it was written, set by nothing — the schema comment
described this exact flow. The binding is keyed on a signed session id with
`claimantId` null until the code is proved, which is what allows a conversation
to exist before an identity does.

**Six faults were found by walking the flow as a claimant**, several of which had
been live on the authenticated page too:

- The review asked for confirmation and showed **nothing**. `WEB_CHAT` declared
  `summaryPanel: true` for a panel that was never built, so the gateway withheld
  the answers — a claimant was asked to agree to a claim submission sight
  unseen. A test had asserted `true` since the adapter was written, so the
  missing summary had a passing test beside it.
- An uploaded document rendered as an **empty bubble**: the `storedDocumentId`
  branch never wrote `caseDocumentId`, so the transcript held a message with no
  text and no document — and an operator opening the thread saw nothing either.
- Onboarding had **no text input at all**: `AnswerControl` renders from
  `currentStep`, and the number-and-code exchange happens before the flow
  starts, so the bot asked for a mobile number with no box to put it in.
- Dates echoed as `2026-08-13T09:00`; the greeting presumed *travel* when the
  flow asks claim type as its own step; and a tapped button rendered as
  `__another:yes` because that callback value was declared in the gateway alone,
  where the function that turns taps into words could not see it.

**COGS note for §2.5:** this door adds no per-claim cost beyond the verification
message. It is desk-review intake — no video, no prosody analysis, no eKYC.

Not yet done: `runPhoneVerification` has no tests, and the route has run
nowhere but a developer machine.

### The inbox becomes a console — 17 August 2026

**The conversations page was rebuilt as a three-pane operator console** — queue,
transcript, claim context — after a survey of current (2026) support-inbox
practice (Intercom's Fin-handover inbox, Zendesk copilot, the shared-inbox
pattern literature). The finding that shaped it: context must travel with the
message. An agent who opens another tab to see what was being claimed answers
the wrong question, so the new right-hand panel keeps the case, its status, the
intake's own progress (parsed from the bot's "(3 of 16)" numbering — derived
presentation, nothing downstream may depend on it) and every document the
conversation has collected, beside the thread.

What else changed, and why:

- **The queue answers "what needs me next" in one scan.** Search over name /
  phone / case number; a wait chip that turns from amber to red at the hour
  mark (a starting threshold, to be revisited against real queue data); the
  assignee named on every handover row so two agents cannot silently draft
  replies to one claimant; the preview prefixed `Bot:` / `You:` so who spoke
  last is visible before what they said. ↑↓ and j/k walk the queue — inbox
  work is hundreds of small decisions, and reaching for the mouse between each
  is the cost that compounds.
- **The transcript reads as a record.** Day separators, grouped consecutive
  messages, and the take-over marked inline at the moment it happened —
  including after the final message, where the bot otherwise just goes quiet —
  because an unexplained change of author is exactly what an auditor will ask
  about.
- **The channel-retention warning is now said in full** in the context panel
  (the header keeps the ⚠), at the place an agent decides what to type.
- **The management controls left the thread header** for the panel; the header
  keeps identity only.
- The 896-line page split into `conversation-list` / `message-thread` /
  `context-panel` / `shared` under `components/conversations/`, all behavioural
  invariants kept (URL-held tab and thread, pinned scroll via ResizeObserver,
  note-mode colour shift, take-over reason requirement, mirror of the server's
  reassignment rule).
- **A `NativeSelect` primitive** (`components/ui/native-select.tsx`) replaced
  bare `<select>`s: the browser draws its caret flush against the edge where no
  stylesheet can reach it, so `appearance-none` plus an owned chevron is the
  only real fix. The two selects in the panel use it; a sweep found no other
  raw selects in either portal.

Verified in the running portal against the seeded conversations: search,
keyboard navigation, note mode, day separators, the trailing take-over marker,
the panel toggle, and both selects at 1440 and 1024 widths. `tsc` and the
production build pass. Not yet done: none of the new components have unit
tests, and the intake-progress regex is only as durable as the bot's numbering
convention — both noted here so neither is mistaken for finished.

### Conversation ↔ Case ↔ Claim audit — 17 August 2026

**Question asked:** does the codebase strictly follow the user-flow site's
account of how a conversation fills a Case and a Case becomes a Claim?
Three rounds: doc claims enumerated, each verified against code, invariants
checked on live rows (974 converted cases: every one holds a claim, no claim
without CONVERTED status, claimant identity consistent across the boundary).

**Held exactly:** both state machines match their transition tables
edge-for-edge (the three unreachable claim statuses still pinned by test);
`convert()` refuses MEDICAL outside expert referral; messaging answers go
through `patchAnswer` + `assertAccess` with no second write path; insert-first
dedupe on the platform message id; HANDOVER stands the bot down on every path
including the error-apology one; only `isReview` submits; `activeCaseId`
releases a finished Case so a claimant can file again.

**Four discrepancies found, three fixed, one recorded:**

1. **The inbox labelled a Case as "Claim"** — found live by an operator whose
   click on the CSE-number landed on the case screen. The panel now says
   "Claim request (case)" and, once conversion has run, links the actual Claim
   — the conversations API's `activeCase` now carries
   `convertedClaim {id, claimNumber, status}` for exactly that link.
2. **User-flow §9b still drew the Telegram OTP** removed on 11 Aug (the
   platform-verified contact binds with no code; the code survives on the
   public web-chat door, where five wrong attempts burn the pending number and
   restart — not the "paused, contact support" the diagram claimed). Diagram
   and note corrected.
3. **User-flow §3 stamped `documentsCompleteAt` during Case intake** — the
   column is the Claim's CSP 10.13 anchor and nothing stamped it at
   conversion, so a conversationally-intaken claim arriving with complete
   evidence started its final-report clock only at the REPORT_PENDING proxy
   the event was built to avoid. Fixed in code: `convert()` now calls
   `refreshDocumentsComplete` after the copy (same method as the upload path,
   so the checklist logic stays in one place); doc rewritten to say where the
   anchor lives. All 744 case-service tests pass.
4. **Cross-tenant reads disagree between the entities** — Cases answer an
   obfuscated 404 to everyone; Claims 404 a claimant but throw 403 at staff of
   another tenant, which confirms the record exists. User-flow §11 said
   "ForbiddenException" and then praised 404 semantics in the same breath; it
   now states the split honestly. **The code asymmetry is recorded, not
   changed** — unifying claim reads onto 404 alters security-relevant API
   behaviour and belongs to its own decision, not an audit's side-effect.

**Two operator-reported fixes landed alongside the audit, same day:**

- **Case details printed raw ISO strings** (`2026-08-17T00:00:00.000Z`) for
  date and datetime intake answers. Now rendered through `formatDateAnswer` —
  the same shared-types formatter the bot's review summary uses, UTC getters
  by design so the operator reads the words the claimant confirmed. A third
  formatter would eventually disagree with the other two; reusing the one is
  the point.
- **The sidebar regrouped by pipeline stage** — Overview / Intake / Assessment
  / Finance / Library / Support — with live pending counts on the Intake
  queues: emails NEEDS_REVIEW+FAILED, conversations OPEN, cases
  SUBMITTED+UNDER_REVIEW. Counts are things the firm owes action on, not row
  totals (INFO_REQUESTED and PENDING wait on the claimant and are excluded).
  Badge queries reuse each page's query key so an open page and its badge
  share one fetch, and are gated by the same permission filter as the nav
  item. Three copy-pasted section renderers became one.

### Listing pages: URL state and shared chrome — 17 August 2026

**Every listing page now holds its tab, search and page in the URL**, through
one hook (`use-list-params.ts`) rather than a convention: tab changes push and
reset the page, search replaces (a back button walking a search letter by
letter is unusable), page 1 stays out of the address, an out-of-range page
snaps back (`usePageClamp`), and a hand-edited tab value falls back to the
default view. Applied to cases, claims (which also gains `view=MY_CLAIMS` —
and loses the bug where switching to My claims kept a stale page number),
documents, sessions, FNOL intake and the tenants admin. Conversations already
worked this way; the hook generalises its decisions.

**The URL is thereby an input surface, so the API validates it**:
`CaseQueryDto` now checks `status`/`channel`/`travelClaimType` against the
Prisma enums and `page`/`limit` as numeric — a hand-typed
`?status=NONSENSE` is a 400 naming the field, where it used to be cast blind
into Prisma and surface as a 500. `findAll`'s tab-bar breakdown is computed
over the search scope (not the status filter), so tab counts narrow with a
search instead of advertising rows the list will not show.

**Same-purpose chrome extracted after an audit found it pasted and drifting**:
`ListTabs` (five hand-rolled tab strips, one of which never announced its
active tab), `ListPagination` (four pagination footers in two disagreeing
layouts), `ViewToggle` (three copies), `EmptyState`. `formatDate` in
`lib/utils.ts` emitted ISO `yyyy-MM-dd` while its sibling and the inline
formatters used `dd MMM yyyy` — one table showed both side by side; now one
format. Remaining, recorded not churned: intake and conversations use pill
buttons where the queue pages use underline tabs (both defensible, one should
win eventually), and the per-domain status-style maps are deliberately
separate because they describe different enums.

### Staff correction of intake answers — 17 August 2026

Implements §6 item 21, decision first, build second, in that order at the
principal's instruction. `PATCH /cases/:id/corrections` (staff roles only,
proxied by the gateway): same `validateAnswer`, same column promotion, same
off-path document retirement as the claimant's own edit — but audited with
actor and before/after values (`CASE_ANSWER_CORRECTED`), refusing masked
payout steps, and leaving `currentStepId` untouched, because a correction is
not a turn. The portal's case screen grows a pencil on each typed answer in
the editable statuses only; frozen statuses show none.

Verified end-to-end on a seeded INFO_REQUESTED case: correction saved through
the UI, `audit_trail` row `{"destination":"Bali"} → {"Osaka"}` with the staff
user attributed, no pencils on an UNDER_REVIEW case, and the demo value
restored through the same endpoint (leaving both corrections in the trail, as
the trail should). All 744 case-service tests pass. The user-flow §9b claim
that `patchAnswer` writes "the audit row" — false since the method was
written — is corrected to say what is actually true: transcripts attribute
claimant turns; the corrections endpoint attributes staff ones.

### Deep audit: plan vs codebase — 10 August 2026

Four delegated auditors verified this document's claims against the working
tree (HEAD `f52ad8e`), one cluster each: schema and migrations, case-service,
the remaining services and deploy, tests and CI. Most claims held — the entity
list, the append-only trigger, the retention CHECK, the router's four
conditions and one-level escalation, the quantum ordering, the fail-closed
export seal, the staging stack, the ownership ratchet at exactly six. What
follows is what did not.

**Five commits had shipped with no record here** — the §8 discipline lapsed for
an afternoon and this document fell six commits behind its branch:

- **Consent now gates the opening of a Case** (`f3e7693`). The §3.4 machinery
  was PASS with 252 consent rows, every one seeded — nothing called it on the
  live path. `CasesService.create` now refuses without a live CLAIM_PROCESSING
  consent, and every channel (web, Telegram, staff capture, FNOL email) passes
  through it. In code, deliberately not a flow step: a step lives in editable
  data. Wiring it exposed a live authorisation hole, since fixed — the consent
  routes carried no `@Roles`, and `RolesGuard` treats missing metadata as
  allow-all, so any claimant could have granted, read or withdrawn consent for
  any other.
- **Identity now gates the decision** (`6633a38`) — see the corrected note in
  the 6 Aug entry above. Includes the guard-ordering lesson: a method-level
  `JwtAuthGuard` runs *after* a class-level `TenantGuard`, so the first cut of
  the verify route succeeded with no basis and no audit row; the two claimants
  verified while it was broken were reverted.
- **A claimant can fix a mistake** (`0a1abbd`) — "back"/"edit" in English and
  Malay, `Case.resumeStepId`, branch-aware resumption derived from the
  `NextRule` structure rather than hand-listed. Also fixed: a finished claim
  now releases its binding — previously a claimant could file exactly one
  claim, ever.
- **The insurer statement and the appointment** (`2887468`). The aged fee-note
  statement gained its screen, and `PATCH /claims/:id/appointment` now writes
  `scheduledAssessmentTime` — read in three places, previously written by
  nobody — moves the claim to SCHEDULED, audits it, and notifies the claimant
  (date, Malaysian time, address only for a site visit, a way to rearrange).
  Refused in the past and on modes with nobody to meet.
- **The ways a claimant gets it wrong** (`f52ad8e`) — non-answer refusal on
  substance steps, dates echoed back spelled-out when the stored value differs
  from what was typed, re-uploads superseding (never deleting) the wrong photo,
  narrow question detection, and "human" as an escape hatch from anywhere.

**Corrections to statements this document already made:**

- The §3 headline still read 19/11/1 after the retention row moved to PASS —
  recounted to **20/10/1**, now agreeing with §7 and the rows.
- Test counts: **509 tests / 39 suites** in case-service, **590 / 45**
  repo-wide (§3.5 carries the figure and a new coverage caveat: risk-analyzer
  has no tests at all).
- The NRIC entry above overstates the blind index: only `Claimant` carries
  `nricHash`; claims, policies and cases are ciphertext + Last4 with no hash.
  Right design — only Claimant is looked up by NRIC — wrong sentence.
- `tripStartDate` was described as promoted to `Claim`; it lives on
  `TravelClaim` (and `Policy`).
- The §4.3 bounded-context table described four contexts while the code
  declares five — `platform` (encryptionKey) added.
- The §3.2 ack row's "recorded, not sent" reason had been stale since
  notifications shipped on 5 Aug — corrected in place.
- The PWA manifest does *not* carry the s.139 tagline (the §3.3 row said it
  did); the `<title>` does, and the welcome page adds three more lines counsel
  should see.
- The research citation drifted: this plan carried "RM13–18M base steady
  state" in three places, but `MARKET_RESEARCH_TPA_REVENUE.md` now puts the
  obtainable share at maturity at **RM9.5M base / RM14M upside / RM5M
  downside** (Year-5 base: RM2.2M net, ~31% EBITDA). All three corrected; the
  other load-bearing values (RM900k–1.4M vs RM300–500k, months 15–22,
  RM8–12/claim, Path B RM0.4M/RM2.3M/RM6–8M, RM60–150M addressable) re-verified
  unchanged.

**A real defect, found and fixed the same day: the travel fast track never
fired.** The router's `isEvidenceComplete` queried evidence requirements by
category alone while the claimant's checklist scoped by travel subtype, so a
flight-delay claim was measured against all thirteen mandatory travel documents
rather than its three — the fourth fast-track condition could never pass, and
`DESK_REVIEW` was unreachable at opening for the very line the §2.5 COGS
ceiling exists to protect. Two code paths answered "complete" differently:
the §3.6 shape, with money on it. Fixed by extraction, not by patching the
copy — `claims/evidence-requirements.ts` now holds the subtype filter and the
four-level precedence as pure functions, both call sites resolve through it,
and a source-scan test refuses either file dropping the import. The extraction
also fixed a second latent defect: the old check counted tenant and global rows
separately, so a tenant row relaxing a global mandatory requirement was still
demanded. 9 tests; case-service at 509. **To re-verify: the 6 Aug "router
agrees with the stored mode on every sampled claim" check ran against the buggy
condition, so the seeded travel modes want re-sampling.**

**Open findings, in priority order — all seven closed later the same day;**
each carries what, if anything, remains:

1. ~~**video-service `WebhooksController` has no guards at all.**~~ Closed:
   `POST /webhooks/daily` now sits behind `DailyWebhookGuard` — a shared
   secret (`DAILY_WEBHOOK_SECRET`, constant-time compared) carried in the
   registered webhook URL, refusing everything when unconfigured, because
   Daily cannot carry the internal key. The manual trigger route is behind
   `InternalAuthGuard`. The outbound call now carries the internal key
   deliberately rather than omitting it by accident — and passes the **same
   biometric consent gate as the uploads path** first, so the webhook is no
   longer the one entrance that skipped it. A consent refusal keeps the
   recording and leaves analysis PENDING: a missing basis is not a failure.
2. ~~**The OTP path carries a hardcoded universal bypass.**~~ Closed: the
   `'123123'` bypass is deleted outright (no repo, doc or demo flow depended
   on it — the console prints the real code in dev, so the bypass had no
   legitimate use), and codes now come from `crypto.randomInt`. Delivery
   itself is still console.log — that remains the §2.2 notifications gap, not
   this finding.
3. ~~**OCR ships claim document images offshore unrecorded.**~~ Closed as an
   exposure — see the §3.4 row: hardcoded URL removed, `OCR_WEBHOOK_URL`
   off-by-default, `N8N_OCR_WEBHOOK` registered. Residual (recorded on that
   row): the transfer record for an *enabled* OCR path still needs an
   ownership-respecting writer.
4. ~~**Telegram is unrecordable in the transfer register.**~~ Closed at the
   registry — entry added, pinning test updated. Same residual as 3: the
   per-conversation write does not exist yet.
5. ~~**The site-visit inspection policy is unwritable.**~~ Closed — the DTO
   and the read response now carry `siteVisitCategories`/`siteVisitThresholds`
   (decimal-string validated, same rule as the fast-track ceilings), so the
   seed is no longer the only author of a spending decision.
6. ~~`TELEGRAM_POLLING_ENABLED` is opt-out.~~ Closed — the poller now starts
   only on the literal `'true'`, logging how to enable it; every default fails
   closed (§4.2). Local `.env` and `.env.example` updated so the running bot
   did not silently stop.
7. ~~The gateway's video module fails open at the caller.~~ Closed —
   `buildHeaders` refuses with "INTERNAL_API_KEY is not configured" instead of
   sending a credential-less request, and the compliance test that previously
   pinned the *omit* behaviour now pins the refusal.
8. ~~`docs/USER_FLOWS.md` (five commits stale) and the static site (six) still
   call site-visit scheduling unbuilt and have missed the consent gate, the
   identity gate and the intake-correction work.~~ **Closed later the same
   day:** both refreshed — the appointment/notification flow drawn as live, the
   consent gate and identity gate noted where their diagrams speak, the
   intake-correction behaviour described, and the stale "identity never
   enforced" row on the site replaced with the gate that now exists.
9. ~~`MARKET_RESEARCH_TPA_REVENUE.md` §3 ("What exists today") describes the
   late-July codebase~~ — **closed later the same day (Rev 8)**: §3 refreshed
   against the tree (router, SLA engine, billing, `BnmNotification`, the
   licence-flip gates and `deploy/staging/` now stated as built; 221 commits /
   59 models / 590 CI tests; the residency paragraph now names the staging
   deployment while keeping residency an open commitment). Every row was stale
   in the *understating* direction — the safe way to be wrong, but the section
   promises "a partner should be able to verify every line", and until Rev 8 a
   partner verifying it could not. The signing-stub and eKYC-vendor rows were
   accurate and stand.

The §3.6 method note held again: every finding above came from reading what the
code actually does or running it — none from re-reading this document's own
assertions. And the counterpart lesson is new: a progress record that must be
updated "after every completed item" drifted within one working day of the rule
being ignored. The audit is the correction, not the substitute.

**Addendum, same day — the third pass.** The first passes audited §3 and §8,
the sections that *claim* current state. A sweep over the planning sections
found the same staleness class hiding in planning tense: §6 items 1, 5 and 6
still describing resolved risks as live, the §2.2 baseline table presenting
30 July as today, and two surviving 10-day final-report references (§4.2 and
the Phase 1b spec) that the 6 Aug 14-day correction (`c5b2127`) never swept —
it corrected the code, the seed and §3.2, and missed the two sentences that
had specified the wrong number in the first place. All annotated rather than
rewritten, so the reasoning stays and the tense no longer lies.

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
- **Not venture-scale in Malaysia alone.** RM9.5M revenue at maturity on the research's current base case (RM5M downside / RM14M upside; RM2.2M net by Year 5) — revised down 10 Aug 2026 from the RM13–18M this bullet previously carried — on a 15–25% steady-state EBITDA margin. A larger outcome needs regional expansion, selling the platform *to* the industry, or the motor pool this scope deliberately excludes — and that is a strategy decision, not a system-design one.

---

*Plan provenance: (round 1) functional codebase audit; (round 2) per-requirement compliance verification audit with file:line evidence; (round 3) cross-check that corrected the matrix, added fit-and-proper coverage and promoted urgent findings to Phase 0; (round 4) scope correction — motor, Individual PA and Medical & Health excluded, travel confirmed in scope via the PA class, FSA s.121 applicability made precise, §3.7 added; (round 5) feasibility check against the market research economics, phase re-sequencing and go/no-go gates (§9). Regulatory sources: FSA 2013 and BNM/RH/PD 032-29 (user-supplied PDFs, read directly), BNM/RH/PD 029-69 CSP PD (fetched from BNM), `docs/MARKET_RESEARCH_TPA_REVENUE.md` for market and cost data. (Round 6) TPA-first trajectory recorded, Path B kept open, COGS ceiling added, gates G10–G11. §8 progress record is maintained continuously as work ships.*
