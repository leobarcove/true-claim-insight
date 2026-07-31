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

Verdicts from the formal per-requirement codebase audit (verified by spot-check): **PASS** (implemented + enforced server-side) / **PARTIAL** (exists but unenforced/incomplete) / **FAIL** (absent). **Current: 18 PASS, 12 PARTIAL, 1 FAIL** (re-audited 31 July 2026; first audit 0/7/20 against a smaller matrix, then 1/7/23). Counted from the rows below, never carried forward by hand — a summary that drifts from its own rows is the false comfort of §3.6. A row reaches PASS only with server-side enforcement *and* a CI test asserting the control; the re-audit found the CI job ran only case-service, so the gateway and crypto suites supported no verdict until that was fixed. The more serious finding is *false comfort*: schema columns, UI badges and docs assert compliance states no code produces (see §3.6). Each row should eventually link to a demonstrable screen or record.

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
| Firm ack of appointment ≤1 wkg day | **PARTIAL** — `Assignment` records the instruction and starts the clock from *when it arrived*, not when work began; acknowledging or declining stops it, since both answer the insurer. Verified live: received Fri 31 Jul → due Mon 3 Aug, and a claim cannot be opened on an unacknowledged appointment. Remains PARTIAL because the acknowledgement is recorded, not **sent** — that needs the notification layer, deferred with the hosting decision | `SlaClock` ACK_TO_ITO + auto-ack template | 1 |
| Preliminary report ~7–14 days (market practice) | **PASS** — `SlaClock` starts on adjuster assignment (7 working days, per-insurer override, KL calendar) and is stopped by the act CSP measures: issuing the PRELIMINARY report through the report engine. Pauses on awaiting-documents and SIU referral bank the remaining days. Operating on real dates since the 2026 calendar was installed — verified live: assignment Fri 31 Jul → due Tue 11 Aug | 2027 calendar when gazetted | done |
| Final report ≤10 wkg days from complete documents | **PASS** — the clock now anchors where CSP puts it: `documentsCompleteAt`, stamped when the last mandatory checklist item is uploaded (set-once — a later upload cannot move the anchor, a deletion cannot unset the fact), starting the ten-working-day clock from that moment. Verified live: the completing upload stamped the anchor and started the clock, 31 Jul → due 14 Aug. `REPORT_PENDING` remains an idempotent fallback start for claims with no checklist. Moving to REPORT_PENDING with mandatory evidence missing blocks in registered mode and is recorded as a TPA — §3.6 #8 closes with this | 2027 calendar when gazetted | done |
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
| s.139 | "Insurance" naming restriction | **PARTIAL** — brand clean, but claimant-web title/PWA manifest say "Insurance Claims Made Easy"; refer to counsel | Policy note + legal review of taglines | 0 |
| s.240 | Director personal liability | — | Motivates ComplianceEvent/Board register | 3 |

### 3.4 PDPA 2010 + AMLA

| Requirement | Current | Target control | Phase |
|---|---|---|---|
| Consent (lawful basis, withdrawal) | **PARTIAL** — the machinery is built, enforced and verified live: `Consent`/`ConsentNotice` with the bilingual approval gate (a version cannot be approved without EN *and* BM — PD s.7), capture refused against unapproved wording, withdrawal retaining the grant, one live consent per subject+purpose at the database, and the biometric purpose actually gating offshore analysis with immediate effect on withdrawal. Remains PARTIAL for exactly one reason: **the notice wording is drafted but unapproved**, pending the legal review, so no consent can yet be captured in production flows — which is the gate doing its job | Legal review of the EN/BM wording; approval is then one API call | 1 |
| NRIC/bank-detail protection | **PASS** — NRIC and bank account number encrypted at rest (AES-256-GCM envelope, versioned ciphertext); plaintext columns dropped, not merely shadowed; lookup via HMAC blind index; ciphertext and index omitted from query results by default so they cannot reach a browser; full value only through an audited firm-admin reveal. NRIC removed from logs; `verify-nric` throttled with non-enumerating errors. **Tests:** 15 crypto (incl. a simulated KMS custody migration) + a schema-reading omit-coverage test | Rotation drill and KMS custody transfer remain operational tasks | done |
| Retention/deletion | **PARTIAL** — see PD 12.8 above: soft delete + scheduled purge + legal hold now exist and are verified. Anonymisation of claimants and purge of non-document records remain to be built | `RetentionPolicy` (7-yr floor per PD 12.8, scheduled deletion/anonymisation; legal hold) | 2 |
| Cross-border transfer (Gemini/Hume/Daily.co/Supabase/Nominatim) | **PARTIAL** — the biometric path (the sensitive-data one) is now consent-gated and fails closed, and a s.129 **transfer register** exists: every Hume, Gemini and Daily.co call writes a `TransferRecord` naming recipient, country, data description, purpose and basis. The register is honest — the gated biometric path records `CONSENT s.129(3)(a)`; the ungated Gemini/Daily paths record **no basis**, because none is established. Remaining: gate those paths (consent or local-LLM default), Supabase/Nominatim recording, and the in-country LLM path itself | Local LLM default for PII docs (real infrastructure, not tunnel); per-tenant provider policy; transfer register | 2 |
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
| **A3** | ✅ **CLOSED** (31 July 2026). Was: no segregation of duties — the 20-permission × 8-role matrix in `adjuster-portal/src/lib/permissions.ts` is frontend-only, and a plain `ADJUSTER` token moved a claim to `APPROVED` through the API with no authority check | Re-verified live: the assigned adjuster is now refused `APPROVED` and still permitted `SCHEDULED`; a firm admin who did not assess it approves, with `FIRM_ADMIN authorised for APPROVED (ceiling 50000)` written to the audit row | `AuthorityLimit` + server-side checks in `ClaimsService`, not the controller — a role decorator cannot know whether this person assessed this claim. An absent limit means no authority, not unlimited. **18 tests** |

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
- **Compliance:** matrix rows flip from FAIL/PARTIAL to PASS only with (a) server-side enforcement evidence and (b) a CI compliance test asserting the control. Current **18 PASS / 12 PARTIAL / 1 FAIL**, recounted from the table (never carried forward by hand) — the matrix is re-audited at each phase exit and the trend is the firm's readiness metric.
- **Feasibility gates:** the §9.6 go/no-go questions are checked at the phase boundaries stated there. Engineering must not outrun validated economics — in particular G2/G3 before Phase 2, and the §9.2 funding decision before Phase 3.
- **Architecture gate:** the three blocking defects in §4.3 must be closed before the platform holds real claimant data in any shared environment. **A1 (service auth) and A3 (segregation of duties) are closed; A2 (data ownership) has its foundation in place with six declared exceptions on a shrink-only ratchet.**
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
| Notifications (email transport, templates, delivery log) | ⏸️ **deferred by decision, 31 July 2026** — not blocked by ignorance. Nothing is deployed to any server and no hosting provider has been chosen, so choosing an email provider first would settle the smaller question before the larger one. The provider analysis is done (§8, SES `ap-southeast-5`); revisit when hosting is settled. Consequence meanwhile: SLA breach escalation persists a row and logs a warning but **reaches no human** — recorded evidence, not an alert |
| Server-side status guards + `AuthorityLimit` | ✅ closes **A3**. Role gate (an outcome is not the assessor's to decide), segregation of duties (the assessor cannot decide their own claim unless a limit expressly permits it), and a monetary ceiling — all enforced in the service, since a role decorator cannot know who assessed what. An absent limit means *no* authority rather than unlimited, because a missing row is far more likely an oversight than a decision. The basis is written onto the audit row. **18 tests**, verified live |
| CI runs every compliance suite | ✅ the re-audit found the CI job ran only `@tci/case-service`, so the gateway's audit tests and crypto's encryption tests supported no matrix verdict. Now `pnpm test` across all packages — possible only because the aggregate was made green earlier |

### Shared crypto infrastructure (supports both encryption items)
`@tci/crypto` is a package, not case-service-local code, because the gateway encrypts too. It holds `EncryptionService`, the `KeyProvider` (master-key custody) and `KeyStore` (data-key persistence) interfaces, and `EnvKeyProvider`. It deliberately does **not** depend on Prisma. The Prisma-backed key store lives once in `@tci/prisma-client` (`PrismaKeyStore`) — it was duplicated byte-for-byte in two services, and since the queries encode *which key version is active*, two copies drifting would produce undecryptable data rather than a clean failure. The seed uses the same class and the same master key, so seeded personal data is encrypted exactly as the application writes it; verified by decrypting seeded ciphertext from a separate process.

### Open decisions blocking further Phase 1a work
1. ~~**Encryption key custody**~~ — resolved: master key in `.env` behind `KeyProvider`, AWS KMS is a one-class swap with no data re-encryption. Key custody is now only an operational step, not a design decision.
2. ~~**BullMQ now or in 1b**~~ — **decided: now** (30 July 2026). It gates five of the six remaining Phase 1 matrix rows, so deferring it would mean building the CSP clocks twice.
3. **Legal review of the consent wording.** The machinery is built and the drafts are written in EN and BM, seeded **unapproved** so nothing can be recorded against them. What is needed: a Malaysian data-protection practitioner on the English, a native speaker on the Malay (a translation that drifts in meaning is worse than none — the subject would have agreed to something other than the English), and confirmation of the named offshore recipients. Approval is then one API call by a compliance officer.
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

Re-audit note, corrected: the sweep ultimately found **four** rows where an early re-audit regex had written the new verdict into the *target* column of the four-column §3.2 table, leaving the old verdict in place — ITO decision, preliminary report, final report, and records-readily-available. Every recount since had read the stale first cell, so the published totals were consistently *conservative* (PASS/PARTIAL upgrades counted as FAIL/PARTIAL) — the right direction to be wrong in, but wrong for three weeks of commits. All four repaired; the recount script now hard-fails on any row carrying two verdicts, so this class of error cannot recur silently. Two of the repaired rows were also stale on their own terms ("cannot operate until the holidays are entered" — the 2026 calendar was installed this morning): preliminary-report reaches **PASS**; final-report stays PARTIAL for the honest reason that its clock anchors on `REPORT_PENDING` rather than a `documentsCompleteAt` event.

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
**Parked 31 July 2026.** The provider comparison below stands, but it is downstream of a decision not yet made: nothing is deployed anywhere and no hosting provider has been chosen. Settling on AWS Malaysia would make the email choice automatic, which is the argument for taking the decisions in that order rather than this one.

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
