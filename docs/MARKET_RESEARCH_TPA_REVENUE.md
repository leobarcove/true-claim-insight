# Market & Financial Assessment — Malaysian Non-Motor and Group/Travel PA Claims Adjusting

**Confidential — for discussion, not for circulation.** Contains commercially sensitive
analysis and forward-looking estimates. Please don't forward or quote it without asking first.
Not investment, legal or tax advice — and the numbers shouldn't be relied on until the
validation work in §10 is done.

| | |
| --- | --- |
| **Version** | Rev 8 · 10 August 2026 · draft for partner discussion (§3 capability statement re-verified against the codebase; market figures unchanged from Rev 7) |
| **Prepared by** | Leo — technical lead, True Claim Insight |
| **Money** | All figures in Ringgit (RM), rounded; ranges are deliberate. Fees are quoted **excluding service tax** — whether SST applies to adjusting or TPA fees is still unverified (§6.4, §10). |

---

## Executive summary

**The opportunity.** Malaysian general insurers spend on claims assessment across the
non-motor lines (fire/property including flood, engineering, liability, marine/aviation/
transit, miscellaneous) and the Group and Travel PA classes. Those lines represent
**~RM11.4–11.6B of annual premium, roughly 47% of the general insurance market**. The
realistically addressable services-and-software spend within them is
**RM60–150M per year** (estimate).

**Why these lines, not motor.** Motor is deliberately excluded. It runs at an underwriting
loss (103% combined ratio in 2025, RM289.3M loss) with insurers squeezing vendor fees, and it
is served by an entrenched incumbent workflow. The non-motor lines are the opposite: **fire
insurance earned a RM700.8M underwriting profit at a 69.5% combined ratio in 2025**, so
insurers there buy service quality and capacity rather than the lowest price. The PA class is
the **fastest-growing line in Malaysian general insurance (+12% in 2025)** with a very low
loss ratio — and PIAM attributes that growth **"mainly to travel insurance demand,"** which is
independent confirmation of the segment this business is targeting.

**The wedge.** Flooding is Malaysia's most severe recurring peril — roughly one major event
every three years, with the December 2021 flood alone generating **RM2–3B of claims exposure**.
Balance matters here: 2024 and 2025 were both mild by comparison (national flood losses of
RM933M and RM637M), so catastrophe upside is real but must not be modelled as annual.
Claim volumes spike 2–5× exactly when adjusters physically cannot reach sites, while BNM's
Claims Settlement Practices policy still imposes turnaround standards. Remote, claimant-guided
assessment with fraud screening addresses a structural weakness in the incumbents'
site-visit model.

**Two engines, one platform.** Property and catastrophe work is high-value, technical and
lumpy. Travel and Group PA work is high-volume, low-value (typically RM200–3,000 per claim)
and adjudicated on documents. Together they give the business recurring transaction volume
underneath a high-margin, event-driven top layer.

**The honest financial picture.**

| | |
| --- | --- |
| Year 1 | **Net loss of RM465,000**; total funding need **RM900,000–1,400,000** including working capital |
| Breakeven | Monthly during **Year 2**; cumulative cash payback during **Year 3** |
| Year 5 revenue | RM5.0M downside · **RM9.5M base** · RM14.0M upside |
| **Year 5 net profit after tax** | RM0.6M downside · **RM2.2M base** · RM3.8M upside |
| Five-year cumulative net profit | (RM0.2M) downside · **RM4.2M base** · RM8.1M upside |
| Steady-state margin | **28–31% EBITDA** by Year 5 in the base case; 16% downside — a services business with a software layer |
| Catastrophe-year uplift | +RM1–3M (base), timing unpredictable |

**What makes or breaks it.** Three things, in order. First, **talent**: BNM requires adjusting
work to be signed off by a senior adjusting employee with five years of subject-matter
experience, and only 55 firms hold registration — AI raises throughput per adjuster but
cannot remove this headcount floor. Second, **panel access**, which is relationship-driven and
takes 6–12 months. Third, **catastrophe timing**, which nobody controls.

**What is already built.** A working multi-tenant claims platform with non-motor claim models,
a fraud-signal framework and an existing unlicensed TPA operation — see §3. This is not a
concept seeking a build; it is an operating system seeking regulatory qualification, panel
access and senior adjusting capability.

**The candid caveat.** As a standalone Malaysian business this is a **profitable niche, not a
venture-scale volume market**. The realistic outcome is a RM9.5M revenue business
earning ~RM2.2M net profit at ~31% EBITDA. All revenue figures rest on three estimates that public sources cannot
confirm, listed in §10. Anyone joining should treat this as a **costed hypothesis with a named
validation plan**, not a validated forecast.

---


## Key structural findings

1. **Assessment work in these lines is loss adjusting**, performed by BNM-registered
   adjusters paid per-case professional fees (ad-valorem scale or time-and-expense) — not
   the per-transaction admin-fee model of medical TPAs.
2. **BNM's August 2025 policy document** requires adjusting work to be performed by
   **full-time employees of registered adjusting firms**, with senior sign-off rules. A tech
   platform cannot simply "be" the assessor — it must register as an adjuster or sell
   to/through registered adjusters and insurers.
3. **Non-motor is the opposite of motor economically.** Motor runs at an underwriting loss
   (combined ratio 103% in 2025); **fire runs at a large underwriting profit** (combined
   ratio 69.5%, RM700.8M profit in 2025). Insurers in these lines buy service quality and
   catastrophe surge capacity, not desperate cost-cutting.
4. **The property market is event-driven.** Flooding is Malaysia's most severe recurring
   peril — major events roughly every 3 years, 14 major floods between 1998 and 2021. The
   December 2021 flood alone generated an estimated **RM2–3B in claims exposure** (PIAM),
   against a normal-year non-motor claims baseline of ~RM1.5–2B. Adjusting demand spikes
   2–5× in catastrophe periods, when physical site access is hardest — which is precisely
   the remote assessment use case. **Counterweight:** 2024 and 2025 were both quiet flood
   years (RM933M and RM637M of national losses), so surge revenue is genuine but episodic.
5. **The PA/travel segment is a different operating model entirely.** Travel and group PA
   claims are high-volume, low-value (typical travel claim RM200–3,000) and adjudicated on
   documents — no adjuster site visits. Loss adjusters are largely absent from this chain;
   the competition is insurer in-house teams, assistance companies (Europ Assistance,
   Allianz assistance network) and claims-automation vendors. Speed is already the
   battleground: Tune Protect pays flight-delay claims **instantly via DuitNow**
   (parametric); Allianz guarantees app claims ≤RM5,000 in **3 working days or pays
   double**. This segment gives the business recurring transaction volume that
   property/catastrophe work cannot — and it is the one part of the market with published
   tailwind: PIAM reports PA growing 12% in 2025 **"driven mainly by travel insurance
   demand,"** and expects further recovery as travel activity improves.

---

## 1. Demand side: market size and claims volumes

All FY2025 figures below are from PIAM's full-year industry briefing (May 2026) — the most
recent published data. Net-claims-incurred detail by class is only published to FY2024, so
those rows are marked accordingly.

| Metric | Value | Basis |
| --- | --- | --- |
| **Total general insurance market** | FY2025: **RM24.2B GWP** (+4.8% on RM23.1B in 2024); underwriting profit **RM1.2B**; combined ratio 93% | verified — PIAM |
| Market structure | 19 direct general insurers + 4 reinsurers | verified — PIAM |
| Fire gross premium | FY2025: **RM5.0B (20.9% of GI)**, +6.9% — second-largest class | verified — PIAM |
| Miscellaneous classes premium | FY2025: **≈RM3.6B (14.9%)** — bonds, engineering/CAR, liability, workmen's compensation, others | derived from PIAM class shares |
| MAT gross premium | FY2025: **≈RM1.8B (7.4%)** — share declined on weaker global trade and geopolitical pressure | verified — PIAM |
| PA class premium | FY2025: **RM1.6B (6.5%), +12% — the fastest-growing class**, which PIAM attributes **"mainly to travel insurance demand"** | verified — PIAM |
| In-scope PA share (excl. Individual PA) | **60–75% of the PA class (~RM0.95–1.2B)** is Group PA + Travel PA + riders/affinity — the Individual-PA split is not published | estimate — validate |
| **In-scope premium base** | **~RM11.4–11.6B/year (~47% of the general insurance market)** | derived |
| Fire underwriting result | FY2025: **RM700.8M profit**, combined ratio **69.5%** | verified — PIAM |
| Motor (excluded, for contrast) | FY2025: RM10.9B premium, **RM289.3M underwriting loss**, combined ratio 103% | verified — PIAM |
| Fire net claims incurred | FY2024: ~RM0.5B (5.5% of total NCI) | verified — PIAM Yearbook 2024 |
| MAT net claims incurred | FY2024: ~RM0.7B (7.7%) | verified — PIAM Yearbook 2024 |
| Miscellaneous net claims incurred | FY2024: ~RM0.4B (4.6%) | verified — PIAM Yearbook 2024 |
| PA class net claims incurred | FY2024: ~RM0.2B (1.8% of total NCI) — very low loss ratio | verified — PIAM Yearbook 2024 |
| **In-scope NCI baseline** | **~RM1.6B/year in a normal (non-catastrophe) year** | derived |
| Dec 2021 flood (the reference catastrophe) | Claims exposure **RM2–3B** (PIAM); insured loss ~RM1.5–2B (Malaysian Re); economic loss RM5.3–6.5B | verified |
| Recent flood years, for balance | Total national flood losses: **RM933.4M (2024)**, **RM636.9M (2025)** — both mild by comparison | verified — DOSM, Apr 2026 |
| Flood protection gap | Historically only ~10% of flood economic losses are insured; under 25% of homeowners carry flood cover | verified — Malaysian Re, Zurich |

**Claim-count estimates (low confidence — no published counts):**

- **Property/commercial lines:** householder/houseowner policies are high-count but very low
  frequency and severity (average premiums RM136/RM369); commercial fire and IAR claims are
  low-count but high value (IAR average premium RM343k); MAT, liability and engineering
  claims are episodic. Plausible normal-year range: **~30,000–80,000 assessable claims/
  year**, of which the adjuster-appointed subset is perhaps **15,000–40,000 instructions/
  year**. In catastrophe years the property claim count multiplies (the 2021 flood produced
  tens of thousands of property and contents claims within weeks).
- **Travel/Group PA:** counts are also unpublished, but the volume logic is opposite —
  many small claims. Flight-delay benefits alone (paid per qualifying delay, increasingly
  parametric/automatic) plus baggage, cancellation and group PA batches plausibly put
  industry-wide in-scope PA claims in the **low-to-mid six figures per year**, at
  RM200–3,000 average value. **This count is the single most important number to validate**
  — it determines whether per-claim pricing can build real revenue in this segment.

---

## 2. What insurers pay for claims assessment

### Fee structure (how, not how much — the "how" is well documented)

Non-motor adjusting is charged on two bases, internationally and in Malaysia:

- **Ad-valorem scale fee:** a regressive percentage of the adjusted loss (higher % on the
  first tranche, stepping down as the loss grows).
- **Time and expense:** hourly/day rates for large or complex losses (business
  interruption, engineering, liability), plus disbursements.

Published Malaysian tariffs do not exist; panel agreements are confidential.
**Industry-practice estimates (require primary validation):**

| Claim type | Estimated fee per case |
| --- | --- |
| Small domestic property (householder/houseowner) | RM500–1,500 minimum-fee territory |
| Mid-size commercial fire/property | RM3,000–15,000 (scale fee on adjusted loss) |
| Large/complex losses (major fire, BI, engineering) | RM50,000+ on time-and-expense |
| Liability/WC investigations | RM1,500–5,000 |

### Implied fee pool

Adjusting fees on property/commercial claims typically run at **~1–3% of claims paid** on
adjusted claims. Against a normal-year in-scope claims baseline of RM1.5–2B:

- **Normal-year non-motor adjusting fee pool: roughly RM30–80M/year** (estimate).
- **Catastrophe years: 2–3× that**, concentrated in months.

This is **materially smaller than the motor fee pool** (previously estimated at
RM200–400M/year) — fewer, larger, more technical cases.

### The PA/travel segment: no adjusters, different fee logic

For Group PA, Travel PA and rider claims, **loss adjusters are largely absent** — insurers
adjudicate in-house on documents, with assistance companies handling the overseas-emergency
slice (Europ Assistance for Tune Protect, with MiCare on admission support; Allianz's own
assistance network). What insurers "pay" for claims handling here is internal operations
cost plus assistance-company retainers, not per-case adjusting fees. Consequences:

- **There is no incumbent fee to capture** — the revenue model is per-claim adjudication
  automation, fraud screening, or SaaS to the insurer's claims team, priced against the
  insurer's internal cost per claim (estimate: RM20–80 of internal handling cost on a small
  travel claim) and against leakage reduction.
- **Speed benchmarks are already extreme:** instant parametric flight-delay payouts via
  DuitNow (Tune Protect), 3-working-day guarantees with a pay-double penalty (Allianz,
  claims ≤RM5,000 via app). Any offering must match or enable this, not slow it down.
- **Fraud is document fraud:** inflated/fabricated baggage claims, doctored receipts,
  claims for trips not taken, undisclosed pre-existing conditions — a strong fit for
  document-AI and voice-risk screening rather than video site assessment.
- **Buyers are concentrated:** Tune Protect (AirAsia channel), Allianz, Zurich, Etiqa,
  AIG and airline/banca partnerships control most Malaysian travel-claim volume — a
  handful of logos to sell to.

### Market structure — who earns these fees today

Of the **55 firms on BNM's List of Registered Adjusters** (verified 21 July 2026), non-motor
work is concentrated in the international networks and a few strong locals:

- **Sedgwick** — self-described largest loss adjusting firm in Asia; dedicated Malaysia
  operation.
- **Crawford & Company** — long-established Malaysian presence.
- **Charles Taylor Adjusting** — large/complex commercial specialist (property, marine,
  aviation, construction & engineering); Malaysian MD and local team.
- **McLarens Malaysia** — tripled its Malaysian team in 2023, offices in KL, Johor and
  Penang; named Insurance Asia News Loss Adjuster of the Year 2025; new MD appointed
  July 2026 — evidence that internationals see growth here.
- **Malayan Adjustment Company (MAC)** and other established locals handle the broad
  mid-market.

This segment competes on **technical credentials (chartered adjusters, engineers, forensic
accountants) and insurer relationships**, far more than on price. That is a higher barrier
to entry than motor adjusting — and the BNM rule that a senior adjusting employee needs
**5 years of experience in the subject matter** to sign off reports makes talent the
binding constraint for any new entrant.

---

## 3. What exists today (capability and traction)

Stated conservatively, with known gaps included — a partner should be able to verify every
line. Further technical detail available on request.

**Operating business.** An **unlicensed TPA operation** (claims administration performed on
behalf of insurers) is running today. A **first insurer client has verbally agreed** to a
white-label engagement, with a multi-panel ambition thereafter. *Verbal, non-binding, and not
yet contracted — treat as a qualified prospect, not secured revenue. Client name withheld in
this copy pending their consent to be named.*

**Platform.** A working multi-tenant claims system, not a prototype: more than 220 commits
across seven services (NestJS/Fastify APIs, React adjuster portal, claimant PWA) on PostgreSQL
via Prisma, with 59 data models and 590 automated tests running in CI. *(Figures re-verified
against the repository 10 August 2026; the commit figure is a floor, not a count, because an
exact number is stale by the commit that records it.)*

| Capability | State |
| --- | --- |
| Non-motor claim models — `FloodClaim`, `TravelClaim`, `Policy`, `Case`, `CaseDocument` | Built |
| Multi-tenant isolation (per-insurer white-label; `TenantGuard`, strict/flexible scopes) | Built |
| Fraud-signal framework — typed provider interface (`FraudSignal`), behavioural scoring (`DeceptionScore`), document analysis (`DocumentAnalysis`), `TrinityCheck` | Built, providers extensible |
| Parametric flood trigger field, JPS gauge and MetMalaysia event references | Schema ready; external feeds pending |
| Per-insurer evidence checklists (`EvidenceRequirement`) — no code change per insurer | Built |
| Remote video assessment (Daily.co integration) | Built |
| Digital signing | Lifecycle and provider interface built; **stub provider only — no signing vendor integrated yet** |
| eKYC / identity verification | Decision gate built — a claim cannot be decided for an unverified claimant; verification is a recorded, audited manual act. **No automated verification vendor integrated yet** |
| Audit trail (`AuditTrail`) supporting BNM's 7-year retention obligation | Built; append-only at database level, with scheduled retention and legal-hold machinery |
| Assessment-mode router (desk review / remote video / site visit / expert referral) | Built — per-insurer fast-track and inspection thresholds, every decision recorded with its reasons |
| SLA / turnaround engine — CSP clocks on a Malaysian working-day calendar, pause and breach escalation | Built (2026 calendar gazetteer-verified; 2027 pending publication) |
| Adjuster report engine — mandatory disclosure sections, senior countersign, immutable issued reports, rendered PDF | Built; the registered-mode hard gates ship inert behind a licence flag |
| Billing — per-insurer fee scales, SST, fee notes with stored derivation, aged insurer statements | Built |
| Conversational intake — web chat and Telegram with human-takeover inbox; FNOL email ingestion | Built |
| Field-level encryption (NRIC, bank details) and PDPA consent capture gating claim opening | Built |
| Compliance registers — conflicts of interest, CPD, fit & proper, background screening, Board events, BNM change notifications | Built, operating inert as a TPA pending registration |

**Known gaps, disclosed.** Third-party signing and eKYC verification vendors are not yet
integrated (both sit behind provider interfaces; signing is a stub). AMLA/CTF screening is
not built, pending a legal read on whether the obligation attaches to the firm directly.
Document AI defaults to an offshore model, and several processors (video, voice analysis,
messaging) handle claimant data outside Malaysia with no cross-border transfer basis yet
established — an in-country inference path is scheduled but not yet real. There is no
production deployment (staging only) and no observability stack. A clause-by-clause
compliance audit is maintained internally and was last re-verified against the codebase on
10 August 2026.

**Data residency — an open commitment, not yet a property of the system.** Malaysian data
residency (AWS ap-southeast-5) is the stated design target. A containerised **staging**
deployment now exists in that region (single instance, Docker Compose behind a TLS edge,
synthetic data only), so the residency path is exercised rather than merely asserted — but
there is **no production deployment**, and several third-party processors (document AI,
video, voice analysis, messaging) still process claimant data outside Malaysia with no
transfer basis established. This will be an early question in any insurer's
information-security review and is treated as a build prerequisite, not a claim.

**Legacy motor surface.** Motor code (`ClaimCategory.MOTOR`, motor rule engine, vehicle master
data) remains in the repository and functional but is **not a target and will not be
extended**, consistent with the pivot.

**What this means for a partner.** The build risk is materially reduced; the open risks are
regulatory qualification, insurer panel access and senior adjusting capability — which is
where a partner adds what capital alone cannot.

---

## 4. Structural constraints and tailwinds

1. **BNM Adjusters Policy Document (29 Aug 2025):** registration required; full-time
   adjusting employees; 5-year seniority for sign-off; 15 CPD hours/year; 7-year record
   retention. Path options: (a) register an adjusting subsidiary and hire senior non-motor
   adjusters, or (b) sell the platform to insurers and existing adjusting firms.
   **PA/travel nuance:** desktop adjudication of travel/group PA claims as an outsourced
   service for an insurer likely falls under BNM's *outsourcing* rules (insurer stays
   accountable) rather than requiring *adjusting* registration — but the FSA s.2(1)
   definition of adjusting business ("investigating the cause and circumstances of a loss
   and ascertaining the quantum") is broad enough that this needs a formal legal read
   before building the travel product.
2. **Merimen is less of a blocker here.** The Merimen eClaims rail is motor-centric;
   non-motor claims workflows are more bespoke (email, reports, site visits) — a genuine
   digitisation gap, but also a sign that volumes were historically too low to justify
   platform investment.
3. **Catastrophe surge is the standout use case for remote assessment.** During floods,
   adjusters physically cannot reach sites for days while claim volumes multiply. BNM's
   Claims Settlement Practices policy (July 2024) imposes turnaround-time standards that
   are hardest to meet exactly then. Claimant-guided video triage, geotagged evidence
   capture and fraud screening directly address this.
4. **Climate trajectory supports the thesis:** major floods ~every 3 years, ~90% of flood
   economic losses uninsured (a gap regulators and the industry want to close — more
   policies → more claims to assess), and reinsurers pressing for better claims data.
5. **Counter-pressure:** fire underwriting is highly profitable at a 69.5% combined ratio,
   so insurers feel less cost pain in these lines; the sales argument must lean on surge
   capacity, turnaround compliance and fraud detection rather than cost-cutting.

---

## 5. Revenue forecast scenarios (neutral)

### Path A — operate as a registered non-motor adjusting firm

Assumes successful registration and, critically, hiring senior non-motor adjusters (the
scarce resource). Fee assumptions from the estimate table above.

| Scenario | Instructions/yr | Blended avg fee | Revenue | Technical headcount (AI-native vs incumbent model) |
| --- | --- | --- | --- | --- |
| Conservative (niche panel, domestic property) | 2,000 | RM1,200 | RM2.4M | 3–4 vs 6–8 |
| Base (multi-line panel, yr 3–4) | 5,000 | RM1,800 | RM9.0M | **8–14 vs 15–25** |
| Optimistic (incl. one catastrophe-year surge) | 8,000–12,000 | RM2,000 | RM16–24M | 15–22 vs 30–45 (plus surge contractors) |

**The AI-native claim, quantified.** Incumbent non-motor adjusters handle roughly 40–60
cases/month. With automated document extraction, drafted reports and remote assessment
replacing most site visits, a blended 80–100 cases/month is a defensible target — lower than
the 100–150 achievable on simple claims, because large commercial and business-interruption
losses remain inherently slow and cannot be compressed much. That implies **roughly half the
technical headcount for the same revenue**, or about **RM650,000–1,100,000 of revenue per
technical employee** versus an incumbent RM350,000–600,000.

Two caveats an investor will test: the statutory minimum headcount for lawful sign-off still
applies regardless of throughput (§6.1), and utilisation is uneven between catastrophe events.
Realistic steady-state EBITDA: **15–25%** (estimate).

### Path B — SaaS platform for insurers and adjusting firms (non-motor claims)

The transaction pool (~15k–40k adjuster instructions/year) is **too small for
motor-style per-transaction pricing** to build a large business. Pricing must be
value-based per case or subscription:

| Scenario | Claims on platform | Pricing | ARR |
| --- | --- | --- | --- |
| Conservative | 5,000 cases | RM80/case | RM0.4M |
| Base | 15,000 cases + 3 insurer subscriptions | RM100/case + RM250k/insurer | RM2.3M |
| Optimistic | 30,000 cases + surge-capacity licences + fraud tier | RM120/case blended + subscriptions | RM6–8M |

A **catastrophe surge-capacity licence** — insurers paying a standing annual fee for
guaranteed remote-assessment capacity when floods hit, analogous to a disaster-recovery
contract — would convert lumpy event demand into recurring ARR. It is the most promising
non-linear revenue structure this research identified, but note that **no evidence was found
of any Malaysian insurer currently buying such a product**; appetite is unvalidated (§10) and
the standby contractor pool needed to honour it is a real cost (§6.3).

**Unit-economics caution (unchanged):** per-claim COGS (video minutes, eKYC at ~RM3–8,
AI fraud analysis potentially several USD/claim) is proportionally less painful here than
in motor because per-case pricing is 3–10× higher — one genuine advantage of the non-motor
scope.

### Path C — travel / Group PA claims adjudication platform (the volume engine)

Sold to insurers as automation + fraud screening on high-volume PA-class claims. Pricing
must sit below the insurer's internal handling cost (~RM20–80/claim, estimate) and COGS
must be kept minimal per claim (document AI, no video, selective eKYC/voice-risk only on
flagged claims):

| Scenario | Claims/yr on platform | Pricing | ARR |
| --- | --- | --- | --- |
| Conservative (1 travel insurer) | 30,000 | RM8/claim | RM0.24M |
| Base (2–3 insurers incl. one airline channel) | 150,000 | RM10/claim + RM200k/insurer fraud tier | RM2.0M |
| Optimistic (majority of travel-claim volume + group PA batches) | 400,000 | RM12/claim blended + fraud tiers | RM6–8M |

Path C's role in the portfolio is **recurring, non-lumpy transaction revenue** that
smooths the catastrophe-driven Path A/B property income — and the fraud-screening data
network effect grows with every claim processed. Its risk is the inverse: thin per-claim
pricing means volume commitments from a small set of concentrated buyers are essential
before building.

---

## 6. Cost structure, year-1 P&L and breakeven

> **Modelling assumptions:** AI-native operating model (workflow digitised end-to-end, minimal
> clerical headcount); **no shareholder or director salaries drawn**; Malaysian Sdn Bhd;
> founders provide engineering. All figures are planning estimates, not quotations.

### 6.1 The cost that AI cannot remove

BNM's Adjusters Policy Document makes certain headcount **non-substitutable** for Path A:
adjusting work "shall be completely carried out by its adjusting employees only" (para 12.2),
those employees must be **full-time under the Employment Act** (para 12.1), new adjusting
employees require **one year of supervision** by a senior adjusting employee (para 12.3), and
any report by someone with under five years' experience must be **signed off by a senior
adjusting employee with five years in that subject matter** (paras 12.4, 12.7).

Consequence: AI raises **cases per adjuster** — plausibly from the incumbent 40–60/month
toward 100–150/month via automated document extraction, drafted reports and remote video
assessment — but it **cannot reduce the required number of qualified adjusters below the
minimum needed for lawful sign-off and continuity**. Senior non-motor adjusters in Malaysia
are chartered-level professionals; budget **RM12,000–20,000/month**, materially above the
RM1,700–5,000/month that field *motor* adjusters command.

**Single-senior risk:** with only one senior adjusting employee, losing that person halts
report sign-off entirely. Two seniors is the practical minimum for a going concern — an
investor-relevant cost floor, not padding.

### 6.2 Malaysian statutory employer costs (frequently omitted)

Payroll costs **more than gross salary**. Verified rates as at 2026:

| Statutory item | Employer rate | Basis |
| --- | --- | --- |
| EPF (employee under 60) | **13%** (wage ≤ RM5,000) / **12%** (> RM5,000) | KWSP Third Schedule wage bands |
| SOCSO (Category 1) | **1.75%** | Wages capped at RM6,000/month |
| EIS | **0.2%** | Wages capped at RM6,000/month |
| HRD Corp levy | **1.0%** (10+ Malaysian employees) / 0.5% (5–9) | Services sector employers; reclaimable against approved training |
| **Effective loading on payroll** | **≈ +14–16%** | applies to every salary line below |

### 6.3 Full cost inventory

**One-off / setup**

| Item | Estimate | Note |
| --- | --- | --- |
| Incorporation, company secretary setup | RM3,000–8,000 | |
| BNM registration preparation (legal/consultant) | RM30,000–80,000 | Fit-and-proper documentation, policies, procedures manuals |
| **Minimum paid-up capital for adjusting business** | **Not verified — confirm from Schedule 2 of the Financial Services (Registered Businesses) Order** | Locked-up capital, not an expense, but increases the funding requirement |
| Legal opinion: does desktop travel adjudication require adjusting registration? | RM20,000–40,000 | FSA s.2(1) scope vs BNM outsourcing rules |
| Senior adjuster recruitment (headhunter ~15–20% of annual package) | RM30,000–70,000 | Scarce talent, 55 firms competing |
| Information-security certification (ISO 27001 or equivalent) | RM40,000–120,000 | Insurer vendor onboarding increasingly requires it; peers such as HealthMetrics hold ISO 27001 |
| Insurer vendor security assessments / penetration testing | RM20,000–50,000 | Per-insurer onboarding requirement |

**Recurring people (the dominant cost)**

| Role | Monthly | Regulated? |
| --- | --- | --- |
| Senior adjusting employee × 2 | RM24,000–40,000 | **Yes — mandatory** |
| Junior adjusting employee × 1–2 | RM4,000–10,000 | Yes (supervised year 1) |
| Engineering (0 if founders unpaid; else 1 mid-level) | RM0–12,000 | No |
| Claims ops / admin support | RM0–4,000 | No — largely automatable |
| **Statutory loading (§6.2)** | **+14–16% of the above** | |

**Recurring compliance**

| Item | Annual estimate |
| --- | --- |
| BNM annual registration fee | Not verified — Third Schedule, Financial Services (Fees) Regulations 2014 |
| External auditor (required at registration) | RM15,000–30,000 |
| Company secretary, filings | RM5,000–10,000 |
| Professional indemnity insurance | RM20,000–50,000 |
| Cyber liability insurance | RM10,000–25,000 |
| CPD: 15 hours/year per adjusting employee (mandated) | RM2,000–5,000/employee + lost billable time |
| 7-year record retention (storage, archival, retrieval) | RM5,000–15,000, compounding yearly |
| PDPA compliance, DPO function | RM10,000–25,000 |
| PIAM/AMLA-adjacent memberships, industry events | RM5,000–15,000 |

**Technology and per-claim COGS**

| Item | Note |
| --- | --- |
| AWS **ap-southeast-5 (Malaysia)** | Data-sovereignty requirement per project rules; Malaysia-region pricing typically exceeds Singapore — model a premium |
| LLM inference | Scales with claim volume; the core AI-native variable cost |
| Daily.co video minutes | Per remote assessment session |
| eKYC (Innov8tif/CTOS) | ~RM3–8 per check |
| Clearspeed voice risk analysis | Priced per claim in USD — use selectively on flagged claims only |
| Hive AI deepfake detection | Per media asset |
| SigningCloud digital signatures | Per document |
| Merimen or insurer system integration | If required by a panel |

**Other operating**

Office/registered premises (BNM requires a principal place of business, with branch
notification) RM3,000–5,000/month; residual physical site visits and travel
RM30,000–60,000/year; **catastrophe surge contractor pool on standby** (the cost side of the
surge-capacity product — retainers or panel agreements with freelance adjusters);
BD and marketing RM30,000–80,000/year; bad debt provision.

**Working capital:** insurers typically settle on **30–90 day terms**. At RM500,000 of
revenue that is roughly **RM60,000–120,000 of receivables to finance** — a funding
requirement, not a P&L line.

### 6.4 Year-1 P&L (realistic, founders unsalaried)

Year 1 is structurally loss-making on the registered route because regulated payroll and
fixed compliance costs land **before** panel appointments produce invoices. BNM registration
requires submission at least 30 working days before commencement plus fit-and-proper
clearance; insurer panel procurement then typically takes 6–12 months.

| Line | Path A+C (registered adjuster) | Path C only (travel/PA platform, unregistered) |
| --- | --- | --- |
| Revenue | RM300,000–600,000 | RM100,000–400,000 |
| Adjusting employees incl. statutory loading | (RM380,000–450,000) | — |
| Engineering (RM0 if founders unpaid) | (RM0–160,000) | (RM0–160,000) |
| Technology, infrastructure, per-claim COGS | (RM50,000–110,000) | (RM40,000–80,000) |
| Office and premises | (RM40,000–60,000) | (RM12,000–30,000) |
| Compliance: audit, co-sec, PI, cyber, PDPA, CPD, BNM fees | (RM100,000–180,000) | (RM40,000–70,000) |
| One-off setup: registration, legal opinion, recruitment, InfoSec | (RM120,000–300,000) | (RM60,000–150,000) |
| BD, travel, contingency | (RM60,000–120,000) | (RM40,000–80,000) |
| **Net profit / (loss)** | **(RM450,000–1,020,000)** | **(RM250,000) to +RM100,000** |
| **Total year-1 funding need** (incl. receivables + paid-up capital) | **RM900,000–1,400,000** | **RM300,000–500,000** |

**Tax:** with a year-1 loss there is no tax charge, and losses carry forward. Malaysian SME
rates (15% on the first RM150,000 of chargeable income, 17% on the next RM450,000, 24%
thereafter, subject to the paid-up capital and gross-income conditions) make tax immaterial
until year 2–3. **Service tax (SST) on adjusting or claims-administration fees is
unverified** — Malaysia's service tax scope expanded on 1 July 2025 and professional
services categories were widened. If in scope at 8%, this affects pricing and cash flow
materially and must be confirmed with a tax adviser before quoting insurers.

### 6.5 Revenue path — and an important reconciliation

The Path A scenario in §5 assumed a **RM1,800 blended fee** per instruction. That assumption
does not survive a benchmark check and has been revised down for the financial model:

- 55 registered firms share a RM30–80M fee pool. A 30-staff firm earning RM4–8M implies
  **RM205,000–410,000 of revenue per technical head**.
- At incumbent throughput (~600 cases/year), that implies a **blended fee of roughly
  RM330–670** — not RM1,800.
- At RM1,800 and AI-assisted throughput, revenue per technical head would be ~RM1.8M, i.e.
  **4.5–9× the incumbent benchmark**. Fee level alone cannot explain that gap.
- Separately, 5,000 instructions a year would be **12–33% of the entire national pool** — a
  very large share for a new entrant.

The model below therefore uses a **blended property fee of ~RM900** (above incumbent average,
crediting a better commercial mix, but not 2× it), and leans on Travel/Group PA and platform
licensing for the balance of revenue. **This is the single most sensitive assumption in the
document** (§10).

| Revenue (RM'm) | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
| --- | --- | --- | --- | --- | --- |
| Downside — fee compression, no travel channel | 0.35 | 1.2 | 2.4 | 3.6 | 5.0 |
| **Base — fee-benchmarked** | **0.5** | **2.2** | **4.5** | **6.8** | **9.5** |
| Upside — fees hold, airline/banca channel won | 0.6 | 3.2 | 6.8 | 10.0 | 14.0 |

Year 5 base revenue splits roughly: property adjusting RM3.5–4M (about 4,000 instructions),
Travel/Group PA RM4M, platform licensing RM2M. Catastrophe years add RM1–3M on top, timing
unpredictable.

### 6.6 Five-year profit forecast

Cost assumptions: payroll includes the **+14–16% statutory loading** (§6.2); technology and
per-claim COGS at 7% of revenue; field, travel and catastrophe-surge contractors at 6%;
business development at 4%; general, professional and bad debt at 3%; compliance, insurance
and office as fixed steps. **No shareholder or director salaries in Years 1–2**; management
salaries enter from Year 3. Tax applies Malaysian SME rates (15% on the first RM150,000 of
chargeable income, 17% on the next RM450,000, 24% above) with losses carried forward.

**Base case (RM'000)**

| | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
| --- | --- | --- | --- | --- | --- |
| Revenue | 500 | 2,200 | 4,500 | 6,800 | 9,500 |
| Payroll incl. statutory | (430) | (1,150) | (2,100) | (3,000) | (4,000) |
| Technology & per-claim COGS | (35) | (154) | (315) | (476) | (665) |
| Field, travel, surge contractors | (30) | (132) | (270) | (408) | (570) |
| Compliance, PI, cyber, audit, CPD | (160) | (200) | (260) | (300) | (340) |
| Office & premises | (55) | (100) | (170) | (230) | (290) |
| Business development | (20) | (88) | (180) | (272) | (380) |
| G&A, professional, bad debt | (15) | (66) | (135) | (204) | (285) |
| One-off setup & registration | (190) | — | — | — | — |
| **EBITDA** | **(435)** | **310** | **1,070** | **1,910** | **2,970** |
| EBITDA margin | — | 14% | 24% | 28% | 31% |
| Depreciation & amortisation | (30) | (60) | (100) | (130) | (160) |
| Tax (losses carried forward) | — | — | (136) | (382) | (629) |
| **Net profit after tax** | **(465)** | **250** | **834** | **1,398** | **2,181** |
| Cumulative net profit | (465) | (215) | 619 | 2,017 | 4,197 |

**Net profit after tax across all three cases (RM'000)**

| Case | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 | Cumulative |
| --- | --- | --- | --- | --- | --- | --- |
| Downside | (585) | (330) | (60) | 200 | 620 | **(155)** |
| **Base** | **(465)** | **250** | **834** | **1,398** | **2,181** | **4,197** |
| Upside | (385) | 625 | 1,611 | 2,454 | 3,784 | **8,089** |

**How to read this.** Three things matter more than the precise figures:

1. **Monthly breakeven arrives in Year 2; cash payback in Year 3.** Three different
   milestones are easy to confuse. *Monthly breakeven* is the first month revenue covers
   costs. *Annual breakeven* is the first profitable full year — Year 2, at RM250,000.
   **Cash payback is the point where cumulative profits have repaid every earlier loss** —
   the year the cumulative row crosses zero, which is Year 3. Year 2 is profitable yet the
   business is still RM215,000 down overall. When a partner asks "when do I get my money
   back," they mean payback, not monthly breakeven. Fund the business to survive roughly
   24 months, not 12.
2. **Margins expand with scale because the cost base is largely fixed.** Compliance, office
   and senior-adjuster capacity are step costs; revenue grows faster than they do. That is
   the AI-native thesis expressed in the P&L — and it holds only if the productivity claim
   is real (§10).
3. **The downside case never pays back inside five years.** If fees compress and no travel
   channel is won, cumulative net profit is still negative at Year 5 (RM155,000 in the red)
   despite a profitable Year 5. That is the scenario to plan against, not the base case.

**Breakeven lands in months 15–22 on the base case.** The dominant variable is not
engineering velocity but **time-to-first-panel-appointment**, because regulated payroll burns
whether or not instructions flow. Secondary variables: whether an airline or bancassurance
travel channel is won (roughly the gap between the conservative and optimistic Path C
columns), and catastrophe timing, which is uncontrollable.

**Margin honesty:** at maturity this is a **services business with a software layer**, not a
software business with services attached. The base case reaches **28–31% EBITDA by Year 5**
(§6.6) because compliance, office and senior-adjuster capacity are step costs that revenue
outgrows. If fees compress, that falls to ~16%. Pushing toward the platform-led mix (Paths B
and C) improves margin and scalability but lowers absolute revenue.


### 6.7 Cash flow and the real funding requirement

Profit is not cash. Insurers settle on 30–90 day terms, so revenue is invoiced well before it
is collected. The table below assumes 35% of a quarter's invoicing is collected within that
quarter and 65% in the following one — and it moves the payback date.

**Base case, quarterly cash (RM'000)**

| | Invoiced | Collected | Cash costs | Net cash | Cumulative cash |
| --- | --- | --- | --- | --- | --- |
| Y1 Q1 | — | — | (330) | (330) | (330) |
| Y1 Q2 | 50 | 18 | (170) | (152) | (482) |
| Y1 Q3 | 150 | 85 | (210) | (125) | (608) |
| Y1 Q4 | 300 | 202 | (225) | (22) | (630) |
| Y2 Q1 | 350 | 318 | (400) | (82) | (712) |
| **Y2 Q2** | 500 | 402 | (450) | (48) | **(760)** ← trough |
| Y2 Q3 | 600 | 535 | (500) | 35 | (725) |
| Y2 Q4 | 750 | 652 | (540) | 112 | (612) |
| Y3 Q1 | 900 | 802 | (800) | 2 | (610) |
| Y3 Q2 | 1,050 | 952 | (850) | 102 | (508) |
| Y3 Q3 | 1,200 | 1,102 | (880) | 222 | (285) |
| Y3 Q4 | 1,350 | 1,252 | (1,036) | 216 | (68) |

Three consequences:

- **The cash trough is RM760,000, reached around month 18** (Y2 Q2) — deeper and later than
  the Year 1 accounting loss of RM465,000 suggests. The trough, not the first-year loss, is
  what has to be funded.
- **Cash payback lags accounting payback by about two quarters.** Cumulative net profit turns
  positive during Year 3, but cumulative *cash* is still RM68,000 negative at the end of
  Year 3 and only crosses zero in early Year 4, because roughly RM880,000 is sitting in
  receivables by then.
- **Working capital grows with success.** Every step up in revenue ties up more cash in
  unpaid invoices. Fast growth consumes cash even while the P&L looks healthy.

**Funding requirement**

| Component | Amount |
| --- | --- |
| Operating cash trough | RM760,000 |
| Contingency at 25% of the trough | RM190,000 |
| **Working funding required** | **≈RM950,000** |
| BNM minimum paid-up capital | Locked capital — **amount unverified** (§10) |
| **Total to raise** | **RM900,000–1,400,000** depending on the capital requirement and buffer |

Do not distribute profits before cash payback in Year 4; Years 2 and 3 profits are needed to
refill the hole dug in Year 1.

---

## 7. Verdict on profitability

- **The addressable fee pool shrinks by roughly an order of magnitude versus motor**
  (~RM30–80M/year normal-year adjusting fees vs ~RM200–400M for motor). Whatever is built
  must win on value per case, not volume.
- **Per-case economics are better and fee pressure is lower** — insurers are profitable in
  these lines and pay for technical quality. But the competition (Sedgwick, Crawford,
  Charles Taylor, McLarens) is credentialed and entrenched, and BNM's 5-year seniority rule
  makes talent, not technology, the gating factor for Path A.
- **Revenue will be lumpy.** A flood year can double revenue; two quiet years can follow.
  Plan cash accordingly; sell surge capacity as a subscription to smooth it.
- **The strongest genuine wedge:** catastrophe surge remote assessment + BNM turnaround
  compliance + fraud screening on property claims. This is a real, regulator-aligned gap
  that incumbents' site-visit model handles poorly.
- **The PA/travel inclusion changes the shape of the business.** Property/catastrophe work
  is high-value and lumpy; travel/group PA is low-value and recurring. Together they form a
  **two-engine model**: Path C transaction volume covers the base while Path A/B
  catastrophe and complex-loss work provides the high-margin spikes. The PA class is also
  the fastest-growing GI line (+12.2% in 2025) with a very low loss ratio — insurers there
  invest in claims experience as a sales weapon, which is an easier conversation than
  cost-cutting.
- **Market sizing, stated the way an investor will ask it.** Total in-scope premium is
  ~RM11.4–11.6B (verified/derived), but premium is not the addressable market. The
  **addressable services and software spend** is the ~RM30–80M normal-year non-motor
  adjusting fee pool plus insurers' internal PA/travel claims-handling cost (unquantified,
  estimate) — call it **RM60–150M of realistically addressable annual spend**. A credible
  obtainable share at maturity is **RM9.5M (base case), RM14M (upside), RM5M (downside)**
  per §6.5–6.6 — roughly a 6–20% share of the addressable pool.
- **Honest bottom line:** as a standalone Malaysian business this is a **solid,
  cash-generative niche — RM9.5M revenue and RM2.2M net profit by Year 5 on the base case,
  at ~31% EBITDA — but not a venture-scale volume market.** Investors
  seeking a large outcome should treat Malaysia as a **beachhead**, with the equity story
  resting on one of: (a) regional expansion, since the same internationals and travel
  insurers operate Asia-wide networks (Tune Protect alone spans a dozen markets); (b)
  becoming the surge/fraud platform layer sold **to** the industry rather than competing
  with it; or or (c) adjacent non-motor lines and specialist classes. Without one of
  those, the realistic outcome is a profitable business earning roughly **RM2.2M net profit a
  year by Year 5, RM4.2M cumulative over five years** — which may be exactly the right goal,
  but should be pitched as such rather than as a platform hypergrowth story.

---

## 8. Risk register

Stated plainly because an investor will find these anyway. Severity reflects impact on the
base case if the risk materialises.

| # | Risk | Severity | Mitigation / current view |
| --- | --- | --- | --- |
| 1 | **Fee assumptions unverified.** Per-case non-motor fees are confidential; the RM500–15,000 table is industry-practice estimate. If actual fees sit at the bottom of each band, year-3 revenue falls toward the conservative column. | High | Validate in primary interviews before committing capital. This is the single largest modelling risk. |
| 2 | **Talent is the binding constraint.** BNM's 5-year subject-matter seniority rule for sign-off means the business cannot operate without scarce senior adjusters, and 55 registered firms compete for the same pool. Losing a senior halts sign-off. | High | Two-senior minimum; equity participation; consider acquiring a small registered firm instead of building. |
| 3 | **Panel access is relationship-driven and slow.** Insurers appoint adjusters they know; procurement cycles run 6–12 months with security assessments. | High | Warm introductions; start with one line and one insurer; consider white-label work under an existing registered adjuster to generate revenue during registration. |
| 4 | **Small TAM.** ~RM30–80M normal-year non-motor adjusting fee pool nationally. Even strong execution yields a RM5–14M revenue business in Malaysia alone. | High | Honest framing: this is a beachhead, not the endgame. Regional expansion or platform licensing is required for venture-scale outcomes. |
| 5 | **Revenue lumpiness.** Catastrophe-driven property work can double a year's revenue, then not recur. | Medium–High | Path C recurring volume plus surge-capacity subscriptions to smooth; hold cash buffer through quiet years. |
| 6 | **Buyer concentration, especially Path C.** A handful of insurers control most travel-claim volume; losing one contract could remove a majority of ARR. | Medium–High | Contract minimum volumes; diversify across 3+ payers before scaling headcount. |
| 7 | **Incumbents are already investing in the same technology.** Sedgwick publishes on AI in loss adjusting and is the largest adjuster in Asia; McLarens tripled its Malaysian team and won regional awards. They have capital, panels and credentials, and can buy or build comparable tooling. | Medium–High | Compete where their site-visit operating model is structurally weak (surge, turnaround compliance) rather than on general capability; or sell to them. |
| 8 | **Regulatory scope uncertainty on travel adjudication.** If BNM deems desktop travel-claim adjudication to be adjusting business, Path C inherits the full registered-adjuster cost base and its economics change materially. | Medium–High | Obtain a formal legal opinion **before** building the travel product. |
| 9 | **Insurers in-house the capability.** Zurich, Allianz and Tune Protect already ship their own claims automation and app-based payouts. | Medium | Position as capacity and fraud-network value that is uneconomic to build per-insurer; avoid competing on basic workflow. |
| 10 | **AI does not reduce regulated headcount** (§6.1) — the "AI-native, low-manpower" thesis holds for throughput and for Path C, but not for Path A's statutory minimum. | Medium | Model Path A margins on realistic headcount; concentrate AI leverage where it is legally unconstrained. |
| 11 | **Data, PDPA and cyber exposure.** Claims data includes personal, medical and financial information; data must stay in Malaysia; a breach would end insurer relationships. | Medium | ap-southeast-5 residency, ISO 27001, cyber cover, DPO function — costed in §6.3. |
| 12 | **Working capital squeeze.** 30–90 day insurer terms against monthly regulated payroll. | Medium | Fund receivables explicitly; do not treat revenue recognition as cash. |
| 13 | **Model-risk and explainability.** BNM requires adjusting reports to disclose facts, assumptions, methods and data sources (para 12.6); black-box AI outputs may be challenged in disputes or by the regulator. | Low–Medium | Human-in-the-loop sign-off, full audit trails, documented methodology — aligns with the 7-year retention rule. |
| 14 | **Unverified capital and tax items.** BNM minimum paid-up capital and SST applicability are both unconfirmed (§6.3, §6.4) and could each shift the funding requirement or pricing. | Low–Medium | Confirm both before finalising any investor financial model. |

---

## 9. What we are looking for

The analysis points to three constraints that money alone doesn't fix. They're what we're
looking for in a partner:

1. **Senior adjusting capability.** BNM requires adjusting reports to be signed off by a senior
   adjusting employee with five years of subject-matter experience (§6.1). A partner who is a
   qualified non-motor adjuster — or who can bring one — is worth more to this business than an
   equivalent amount of cash.
2. **Insurer panel access.** Appointments are relationship-driven and take 6–12 months (§8). Existing credibility with insurer claims leadership compresses the single longest
   item on the critical path.
3. **Funding.** Year 1 requires **RM900,000–1,400,000** including working capital (§6.4).

Two open questions we'd want to work through together: whether we pursue BNM registration
directly or partner with an existing registered firm, and how the working arrangement is
structured. Both are conversations, not fixed positions.

*[Leo — add the specific role and terms here if you want them in writing before the meeting.
Leaving it open is also a valid choice for a first conversation.]*

---

## 10. What could not be verified publicly — validate before committing

| Open question | How to validate |
| --- | --- |
| Actual non-motor fee scales / time-and-expense rates on insurer panels | Interviews with claims heads at PIAM member insurers; ex-staff of the international adjusting firms |
| Annual count of non-motor adjuster instructions | ISM member data via an insurer partner; AMLA member firms |
| **BNM minimum paid-up capital for adjusting business** (affects funding requirement) | Schedule 2, Financial Services (Registered Businesses) Order; confirm directly with BNM |
| **BNM annual registration fee** for a registered adjuster | Third Schedule, Financial Services (Fees) Regulations 2014 |
| **Whether service tax (8%) applies to adjusting / claims-administration fees** (affects pricing and cash flow) | Tax adviser; SST scope expansion effective 1 July 2025 |
| Realistic cases-per-adjuster-per-month with AI assistance (the productivity claim in §5) | Time-and-motion benchmarking during pilot; compare against incumbent 40–60 baseline |
| **Blended fee per adjusting instruction** — the most sensitive input in the model; RM1,800 fails an incumbent revenue-per-head benchmark, RM900 is assumed (§6.5) | Panel fee schedules from insurer claims heads; ex-staff of registered adjusting firms |
| **Annual travel/group PA claim counts and internal cost-per-claim** (the load-bearing number for Path C) | Discovery with Tune Protect, Allianz, Zurich, Etiqa claims operations |
| Individual-PA vs Group/Travel-PA split of the RM1.6B PA class | ISM statistics via an insurer partner |
| Whether desktop travel-claim adjudication requires adjusting registration or falls under outsourcing rules | Formal legal opinion (FSA s.2(1) definition vs BNM outsourcing policy) |
| Insurer appetite for a surge-capacity subscription product | Direct discovery conversations with 3–5 insurers' claims/CAT teams |
| Whether internationals would license a third-party remote-assessment platform | BD conversations with Sedgwick/McLarens/Crawford Malaysia |

Recommended: 5–10 primary conversations before financial commitment. The three load-bearing
estimates are the property fee-per-case table, the adjuster-instruction count, and the
travel/PA claim-count range.

**Investor-readiness assessment.** This document is a defensible market and cost analysis
built on public data, and it is honest about a small TAM and a services-margin profile. What
it does **not** yet contain, and what a professional investor will ask for: (i) any primary
validation of the fee and volume estimates, (ii) a signed or verbal letter of intent from at
least one insurer, (iii) confirmation of the two unverified regulatory/capital items above,
and (iv) evidence for the cases-per-adjuster productivity claim. Presenting the forecast as a
**validated** model before those four exist would misrepresent its confidence level; present
it as a costed hypothesis with a named validation plan.

---

## About this document — scope, method and limitations

> **Purpose:** Neutral, research-based assessment of what loss adjusters and claims service
> providers charge Malaysian insurers in the **in-scope general insurance lines**, the size of
> the fee pool, and the realistic profitability of entering this business with the True Claim
> Insight platform.
>
> **Scope:** Fire/Property, Construction & Engineering, Liability,
> Marine/Aviation/Transit (MAT), Bonds, Workmen's Compensation and Miscellaneous classes,
> **plus the Personal Accident (PA) class excluding Individual PA** — i.e. Group PA,
> Travel PA (travel insurance), PA riders/add-ons and affinity/niche PA are **in scope**.
> **Explicitly excluded:** Motor, Medical & Health, and Individual PA (standalone personal
> accidental death/disablement adjudication).
> *Classification note:* travel insurance in Malaysia is a **product written under the PA
> class** (PA core benefits + travel-inconvenience add-ons), not a statistical class of its
> own — which is why the PA class must be partially included to capture travel claims.
>
> **Data currency:** prepared 30 July 2026 using the most recent published figures — PIAM's
> **FY2025 full-year results** (released May 2026) for market size, class shares and
> underwriting outcomes, and DOSM's **2025 flood-loss report** (April 2026). Net-claims-incurred
> detail by class is only published to FY2024 and is labelled as such.
> **Method and limitation:** **desk research only** — PIAM full-year and half-year briefings,
> PIAM Yearbook, ISM data, BNM policy documents, DOSM flood statistics, Malaysian Re
> *Malaysian Insurance Highlights*, and company/industry sources. **No primary interviews have been conducted.** Per-case
> adjusting fees are negotiated privately and published nowhere, which is itself a finding.
>
> **How to read the numbers.** Every figure is labelled one of three ways: **verified**
> (traceable to a cited public source), **derived** (arithmetic on verified figures, method
> shown), or **estimate** (industry-practice judgement requiring validation). The three
> load-bearing estimates are flagged in §10. This document is intended to support an
> investment discussion honestly — including where it is weak — not to advocate a position.

---

## Sources

- PIAM Yearbook 2024 — https://piam.org.my/pdf/piam-yearbook-2024.pdf
- PIAM FY2025 full-year results: GWP RM24.2B, +4.8%, underwriting profit RM1.2B; PA +12% "driven mainly by travel insurance demand" (The Star, 6 May 2026) — https://www.thestar.com.my/business/business-news/2026/05/06/general-insurance-industry-grows-48-in-2025-posts-rm12bil-underwriting-profit---piam
- PIAM 1H2025 results: GWP RM12.3B, underwriting profit RM629M, combined ratio 92.1% (The Star, 8 Oct 2025) — https://www.thestar.com.my/business/business-news/2025/10/08/motor-fire-segments-fuel-growth-in-malaysia039s-general-insurance-industry---piam
- DOSM Special Report on the Impact of Floods in Malaysia 2025 (national flood losses RM636.9M in 2025; RM933.4M in 2024) — https://www.dosm.gov.my/portal-main/release-content/special-report-on-impact-of-floods-in-malaysia2025
- PIAM Insurance Data (ISM Q4 2024) — https://piam.org.my/in-focus/resources/insurance-data
- PIAM press release: GI industry posts RM1.2B underwriting profit; fire RM700.8M profit, CR 69.5% (2025 results) — https://piam.org.my/news-media/stay-ahead/press-releases/article/Malaysia-s-General-Insurance-Industry-Posts-RM1-2-Billion-Underwriting-Profit-Reinforcing-Financial-Resilience-for-Malaysians
- Malaysian Re, *Malaysian Insurance Highlights 2021* (Dec 2021 flood: RM2–3B claims exposure, flood history, protection gap) — https://www.malaysian-re.com.my/api/uploads/MIH_22_final_a6da7cf755.pdf
- Malaysian Re, *Malaysian Insurance Highlights 2024* — https://www.malaysian-re.com.my/api/uploads/Malaysian_Insurance_Highlights_2024_df82519933.pdf
- PIAM flood claims estimate RM3B (The Edge / Malay Mail, Dec 2021) — https://theedgemalaysia.com/article/general-insurance-industry-facing-rm3-billion-floodrelated-claims-says-piam
- BNM Policy Document: Registration Procedures and Requirements on Professionalism of Adjusters (29 Aug 2025) — https://www.bnm.gov.my/documents/20124/855632/PD_Registration_Procedures_and_Requirements_on_Professionalism_of_Adjusters.pdf
- BNM List of Registered Adjusters (55 firms as at 21 July 2026) — https://www.bnm.gov.my/-/registered-adjusters
- KPMG factsheet: BNM Claims Settlement Practices (July 2024) — https://assets.kpmg.com/content/dam/kpmg/my/pdf/factsheet-claims-settlement-practices.pdf
- Sedgwick Malaysia solutions brochure ("largest loss adjusting and risk management company in Asia") — https://marketing.sedgwick.com/acton/attachment/4952/f-a193fcef-3c62-49dd-b565-c7a2f3f306de/1/-/-/-/-/Sedgwick_Malaysia_Solutions-Brochure-English.pdf
- McLarens Malaysia expansion & MD appointment — https://www.mclarens.com/mclarens-appoints-lam-choy-heng-as-managing-director-mclarens-malaysia/
- Charles Taylor Adjusting Asia (large/complex commercial focus, Malaysia office) — https://www.charlestaylor.com/en/asia
- Loss adjuster fee bases (time/hourly rate vs ad-valorem scale fee) — Australian Treasury consultation submission, Insurance Claims Handling — https://treasury.gov.au/sites/default/files/2019-10/t406602_iicp.pdf
- AMLA (Association of Malaysian Loss Adjusters) — https://amla1981.org/
- Malayan Adjustment Company — https://www.macsb.com.my/
- Tune Protect Travel Easy (instant DuitNow flight-delay claims, 3:3:3 promise, Europ Assistance/MiCare partnerships) — https://www.tuneprotect.com/my/products/travel-easy-insurance
- Allianz Travel Insurance Malaysia (3-working-day claims guarantee "or we pay double", benefit schedule) — https://www.allianz.com.my/personal/home-motor-and-travel/travel-and-flight-insurance/allianz-travel-insurance.html
- Skrine / Lexology commentary on the BNM Adjusters Policy Document — https://www.lexology.com/library/detail.aspx?g=1a555fe6-96a4-499b-bc28-610cee66e1e0
- EPF employer contribution rates (13% / 12%) — KWSP — https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution
- SOCSO 1.75% and EIS 0.2% employer rates, RM6,000 wage ceiling — https://www.ajobthing.com/resources/blog/epf-socso-eis-contribution-2026-latest-rates-rules-employer-guide-malaysia
- HRD Corp levy (employer training levy, services sector) — https://hrdcorp.gov.my/employers
- SST scope expansion effective 1 July 2025 (service tax applicability to be confirmed) — https://landco.my/information-sharing/sst-scope-threshold-rate

