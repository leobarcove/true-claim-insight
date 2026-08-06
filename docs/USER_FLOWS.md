# User flows — True Claim Insight as a TPA

Every diagram here is drawn from the code, not from intent. State machines
mirror `CASE_STATUS_TRANSITIONS` (`apps/case-service/src/cases/cases.service.ts`),
`CLAIM_STATUS_TRANSITIONS` (`apps/case-service/src/claims/claim-transitions.ts`)
and the Prisma enums. Where a step is planned rather than built it is marked
**(planned)**, so this document cannot become the false comfort §3.6 warns about.

Read `MASTER_PLAN.md` §2 for the narrative these diagrams formalise.

---

## 1. The whole journey, end to end

Five intake channels converge on one Case funnel; a vetted Case converts to a
Claim, which is the regulated engagement.

```mermaid
flowchart TD
    subgraph INTAKE["1 · Notification of loss"]
        C1["`Claimant
PWA :4001`"]
        C5["`Claimant
Telegram`"]
        C2["`Agent or broker
email`"]
        C3["`Insurer forwards
FNOL`"]
        C4["`Staff capture
portal :4000`"]
    end

    C1 --> CASE
    C5 --> BIND["`Verify the sender
phone share + OTP`"]
    BIND --> CASE
    C2 --> ING["`FNOL email ingestion
deterministic parse + policy match`"]
    C3 --> ING
    C4 --> CASE
    ING --> CASE

    CASE["`**Case** — pre-claim intake funnel
channel · answers · documents · consent`"]

    CASE --> VET{"2 · Operator vets"}
    VET -->|"detail missing"| INFO["`INFO_REQUESTED
claimant amends`"]
    INFO --> CASE
    VET -->|"medical"| EXP["`REFERRED_TO_EXPERT
never auto-assessed`"]
    VET -->|"not covered"| REJ["REJECTED"]
    VET -->|"vetted"| CONV
    EXP --> CONV

    CONV["`3 · convert() → **Claim**
the insurer-facing handback record`"]

    CONV --> MODE{"4 · Assessment-mode router"}
    MODE -->|"`small claim,
no fraud signal`"| DESK["`DESK_REVIEW fast-track
final report 3 wkg days`"]
    MODE -->|"standard"| VIDEO["`Video assessment
Daily.co + risk-analyzer`"]
    MODE -->|"`property loss
over the threshold`"| SITE["`Site visit or expert
*visit is not yet scheduled*`"]

    DESK --> ASSESS
    VIDEO --> ASSESS
    SITE --> ASSESS

    ASSESS["`5 · Assessment
evidence checklist · quantum · fraud signals`"]
    ASSESS --> REPORT["`6 · Adjuster report
PD 12.6 disclosure · sign-off`"]
    REPORT --> HANDBACK["`7 · Handback to insurer
the insurer decides the claim`"]
    HANDBACK --> BILL["`8 · Fee note
TPA schedule or adjuster fee scale`"]

    style CASE fill:#e8f4ea,stroke:#2d6a4f
    style CONV fill:#e8f4ea,stroke:#2d6a4f
    style MODE fill:#e8f4ea,stroke:#2d6a4f
    style DESK fill:#e8f4ea,stroke:#2d6a4f
    style SITE fill:#e8f4ea,stroke:#2d6a4f
    style HANDBACK fill:#fdf0e3,stroke:#b5651d
    style ING fill:#eef2fb,stroke:#3b5bA9
```

> **The firm recommends; the insurer decides.** Nothing in this system settles a
> claim. Step 7 is a handback, and the adjuster report says so on its face.

> **Step 4 decides how the claim is examined.** Four conditions must all hold
> for desk review, and the mode is disclosed in the report as a PD 12.6
> *method* — "desk review on documents alone" and "site inspection" reach the
> same figure by different means.

---

## 2. Case intake — the exact state machine

Transitions below are the whole of `CASE_STATUS_TRANSITIONS`. Anything not drawn
is refused server-side.

```mermaid
stateDiagram-v2
    [*] --> DRAFT: case created

    DRAFT --> IN_PROGRESS: first answer captured
    DRAFT --> SUBMITTED: one-page staff form
    DRAFT --> ABANDONED

    IN_PROGRESS --> SUBMITTED: claimant reviews and submits
    IN_PROGRESS --> ABANDONED

    SUBMITTED --> UNDER_REVIEW: operator opens it
    SUBMITTED --> INFO_REQUESTED
    SUBMITTED --> REFERRED_TO_EXPERT
    SUBMITTED --> CONVERTED
    SUBMITTED --> REJECTED

    UNDER_REVIEW --> INFO_REQUESTED: detail missing
    UNDER_REVIEW --> REFERRED_TO_EXPERT: medical
    UNDER_REVIEW --> CONVERTED: vetted
    UNDER_REVIEW --> REJECTED

    INFO_REQUESTED --> SUBMITTED: claimant amends and resubmits
    INFO_REQUESTED --> ABANDONED

    REFERRED_TO_EXPERT --> CONVERTED: expert outcome received
    REFERRED_TO_EXPERT --> REJECTED

    CONVERTED --> [*]
    REJECTED --> [*]
    ABANDONED --> [*]

    note right of REFERRED_TO_EXPERT
        MEDICAL cases cannot reach CONVERTED
        by any other route. Conversion refuses.
    end note

    note right of INFO_REQUESTED
        The only backward edge in the machine.
        Answers are editable only here and in
        DRAFT / IN_PROGRESS.
    end note
```

---

## 3. Claimant submits a case

The conversational intake: one question at a time, resumable via
`currentStepId`, with the flow chosen by travel claim type.

```mermaid
sequenceDiagram
    autonumber
    actor CL as Claimant
    participant PWA as Claimant PWA
    participant GW as API Gateway
    participant CS as case-service
    participant ST as Storage

    CL->>PWA: Start a claim
    PWA->>GW: POST /auth/claimant/send-otp
    GW-->>CL: OTP by SMS
    CL->>PWA: Enter OTP
    PWA->>GW: POST /auth/claimant/verify-otp
    GW-->>PWA: JWT — sub IS the claimant id

    PWA->>CL: Show PDPA notice (EN / BM)
    CL->>PWA: Consent
    PWA->>CS: POST /consent — recorded against approved wording v1

    PWA->>CS: POST /cases {travelClaimType}
    CS-->>PWA: Case DRAFT + first step

    loop One step at a time
        PWA->>CL: Ask step prompt
        CL->>PWA: Answer
        PWA->>CS: PATCH /cases/:id/answers
        CS->>CS: validateAnswer against the flow rule
        alt bank account number
            CS->>CS: encrypt, store mask in answers, last4 in the clear
        end
        CS-->>PWA: next step + completeness
    end

    loop Required documents
        CL->>PWA: Upload evidence
        PWA->>CS: POST /cases/:id/documents
        CS->>ST: store file
        CS->>CS: stamp documentsCompleteAt when last mandatory item lands
    end

    CL->>PWA: Review and submit
    PWA->>CS: POST /cases/:id/submit
    CS->>CS: policy auto-match, then CSP 24h / 30-day flags
    CS-->>CL: Case SUBMITTED — reference number
```

**Two flags computed at submission, both advisory at intake:** `notifiedLate`
(notified more than 24 hours after the incident) and `outOfWindow` (more than 30
days). They surface as warnings to the operator; they never auto-reject.

---

## 4. Operator vetting, and the request-for-information loop

```mermaid
flowchart TD
    S["Case SUBMITTED"] --> OPEN["`Operator opens it
→ UNDER_REVIEW`"]
    OPEN --> CHK{"Checks"}

    CHK --> Q1{"Policy matched?"}
    Q1 -->|no| LINK["`needsPolicyReview = true
operator links policy by hand`"]
    LINK --> Q2
    Q1 -->|yes| Q2{"`Evidence checklist
complete?`"}

    Q2 -->|no| REQ
    Q2 -->|yes| Q3{"Claim type?"}

    REQ["`**INFO_REQUESTED**
reviewNote carries the ask`"]
    REQ --> NOTIFY["`Notify claimant
by email`"]
    NOTIFY --> AMEND["`Claimant reopens intake,
adds the missing item`"]
    AMEND --> RESUB["Resubmit → SUBMITTED"]
    RESUB --> OPEN

    Q3 -->|MEDICAL| EXPERT["`**REFERRED_TO_EXPERT**
form + routing only,
no automated assessment`"]
    Q3 -->|other| Q4{"`Covered under
the policy?`"}

    EXPERT --> EOUT{"Expert outcome"}
    EOUT -->|proceed| CONVERT
    EOUT -->|decline| REJECT

    Q4 -->|no| REJECT["`**REJECTED**
reason recorded`"]
    Q4 -->|yes| CONVERT["`**convert()** → Claim created`"]

    style REQ fill:#fdf0e3,stroke:#b5651d
    style EXPERT fill:#fdf0e3,stroke:#b5651d
    style CONVERT fill:#e8f4ea,stroke:#2d6a4f
```

The loop `INFO_REQUESTED → SUBMITTED → UNDER_REVIEW` may run any number of
times. Every pass writes an audit row with before/after values.

---

## 5. Insurer-appointed entry — the Assignment

Where the regulated engagement actually begins. Under TPA operation a Case
converts to a Claim; under insurer appointment the Assignment comes first and
the Case is optional.

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: insurer instructs the firm

    RECEIVED --> ACKNOWLEDGED: ack sent
    RECEIVED --> DECLINED: conflict or capacity

    ACKNOWLEDGED --> ACCEPTED: claim opened
    ACKNOWLEDGED --> DECLINED

    ACCEPTED --> COMPLETED: closed out

    DECLINED --> [*]
    COMPLETED --> [*]

    note right of RECEIVED
        Starts the ACK_TO_INSURER clock:
        1 working day (CSP).
        Before Assignment existed the clock
        measured from nothing and could be
        neither met nor missed.
    end note

    note right of ACCEPTED
        Registered mode gates here:
        COI declared, competency matched,
        rotation checked.
    end note
```

> **The acknowledgement is now sent, not just recorded.** Acknowledging emails
> the appointing contact and stops the CSP clock in the same act, so the
> one-working-day obligation is discharged by the system rather than by
> remembering.

---

## 6. Claim lifecycle — the exact state machine

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED: converted case or accepted assignment

    SUBMITTED --> ASSIGNED: adjuster assigned
    ASSIGNED --> SCHEDULED: assessment booked
    SCHEDULED --> IN_ASSESSMENT: assessment starts
    IN_ASSESSMENT --> REPORT_PENDING: evidence complete
    REPORT_PENDING --> APPROVED
    REPORT_PENDING --> REJECTED

    IN_ASSESSMENT --> ESCALATED_SIU: fraud signal
    REPORT_PENDING --> ESCALATED_SIU
    ESCALATED_SIU --> APPROVED
    ESCALATED_SIU --> REJECTED
    ESCALATED_SIU --> CLOSED


    APPROVED --> CLOSED
    REJECTED --> CLOSED

    CLOSED --> IN_ASSESSMENT: supplementary claim

    DOCUMENTS_PENDING
    PENDING_ASSIGNMENT
    UNDER_REVIEW

    note right of CLOSED
        The reopen edge exists because the
        supplementary endpoint really does
        reopen — and starts a 5-working-day
        CSP clock. The machine tells the truth
        about what the endpoint does.
    end note

    note left of REPORT_PENDING
        Reached only once the evidence checklist
        is complete. Registered mode blocks the
        move. TPA mode records it.
    end note
```

Every claim state may also go straight to `CLOSED`, `APPROVED` or `REJECTED`
from the early states — an insurer can withdraw at any point.

> ⚠️ **Three statuses exist but nothing reaches them.** `DOCUMENTS_PENDING`,
> `PENDING_ASSIGNMENT` and `UNDER_REVIEW` are defined in `ClaimStatus` and shown
> above detached, because no transition leads to any of them. A recorded Phase 1
> lifecycle gap, pinned by a test so it cannot be quietly forgotten.

---

## 7. Adjuster assessment and report sign-off

```mermaid
flowchart TD
    A["Claim ASSIGNED"] --> AUTH{"Authority check"}
    AUTH -->|"no AuthorityLimit row"| BLOCK["`Refused — an absent limit
means no authority, not unlimited`"]
    AUTH -->|"limit present"| SCHED["Schedule assessment"]

    SCHED --> MODE{"Assessment mode"}
    MODE -->|desk review| DESK["Documents only"]
    MODE -->|video| VID["Daily.co room"]
    MODE -->|site| SITE["Physical inspection"]

    VID --> CONSENT{"`Biometric consent
on record?`"}
    CONSENT -->|no| NOANALYSIS["`No prosody or attention analysis.
Fails closed — including when
case-service is unreachable`"]
    CONSENT -->|yes| ANALYSE["`risk-analyzer:
Hume · MediaPipe · Parselmouth`"]
    ANALYSE --> XFER["`TransferRecord written
recipient · country · basis`"]

    DESK --> EV
    NOANALYSIS --> EV
    XFER --> EV
    SITE --> EV

    EV["Evidence checklist"] --> COMPLETE{"`All mandatory
items in?`"}
    COMPLETE -->|no| CHASE["Chase claimant"]
    CHASE --> EV
    COMPLETE -->|yes| STAMP["`documentsCompleteAt stamped
→ FINAL_REPORT clock starts
14 working days (CSP 10.13)`"]

    STAMP --> QUANT["`Quantum worksheet
average · betterment · excess`"]
    QUANT --> DRAFT["Report DRAFT"]

    DRAFT --> SECTIONS{"`PD 12.6 sections
all present?`"}
    SECTIONS -->|"any blank"| REFUSE["`Cannot submit —
facts, assumptions,
methodology, sources`"]
    REFUSE --> DRAFT
    SECTIONS -->|complete| REVIEW["IN_REVIEW"]

    REVIEW --> SIGN{"`Signer is an
adjusting employee?`"}
    SIGN -->|"no — e.g. firm admin"| REFUSE2["Refused: PD 12.7"]
    SIGN -->|yes| MODEQ{"licensedMode?"}

    MODEQ -->|"on — registered"| COUNTER["`Countersign required
self-sign refused`"]
    MODEQ -->|"off — TPA"| RECORD["`Countersign basis recorded,
not enforced`"]

    COUNTER --> SIGNED["SIGNED"]
    RECORD --> SIGNED
    SIGNED --> ISSUED["`ISSUED — immutable.
Stops the SLA clock.
Corrections supersede via supersedesId`"]

    style BLOCK fill:#fbeaea,stroke:#a33
    style REFUSE fill:#fbeaea,stroke:#a33
    style REFUSE2 fill:#fbeaea,stroke:#a33
    style NOANALYSIS fill:#fdf0e3,stroke:#b5651d
    style ISSUED fill:#e8f4ea,stroke:#2d6a4f
```

**The report cites a worksheet revision.** Creating a report pre-fills the
PD 12.6 quantum section from the current worksheet and records which revision it
used, so the figure and its workings cannot silently diverge. A draft citing a
superseded revision reports itself as outdated; an issued report keeps the figure
it was signed against.

**Segregation of duties (A3):** the assessor cannot decide their own claim
unless an `AuthorityLimit` expressly permits it, and never above its monetary
ceiling. The basis is written onto the audit row.

---

## 8. CSP clocks running underneath

```mermaid
flowchart LR
    subgraph FIRM["The firm's own turnaround — escalated"]
        A["`ACK_TO_INSURER
1 working day`"]
        P["`PRELIMINARY_REPORT
per-insurer target`"]
        F["`FINAL_REPORT
10 wkg days from
complete documents`"]
        S["`SUPPLEMENTARY_CLAIM
5 working days`"]
    end

    subgraph INSURER["Insurer side — measured, never escalated"]
        D["`INSURER_DECISION
7 working days`"]
        Y["`INSURER_PAYMENT
14 working days`"]
    end

    A --> P --> F --> D --> Y
    F -.-> S

    SWEEP["Sweep every 15 min"] --> BR{"Past due?"}
    BR -->|yes| ESC["`BREACHED
level 1 → 2 at 2 wkg days
→ 3 at 5`"]
    ESC --> CE["`Level 3 raises a ComplianceEvent
PD 11.2(d) Board escalation`"]
    BR -->|"due soon"| WARN["One warning per clock"]

    style INSURER fill:#eef2fb,stroke:#3b5bA9
```

`monitorOnly` stages are the insurer's delay, not the firm's: measured so the
firm can evidence where a delay originated, never escalated against it.

**The escalation now reaches a person** — a firm-owned breach emails the
operations address, deduplicated per clock and per level so a breach left open
over a weekend sends once rather than every fifteen minutes.

---

## 9. FNOL email ingestion

```mermaid
flowchart TD
    POLL["`Poll mailbox every 5 min
only when FNOL_INTAKE_ENABLED`"] --> FETCH["`Fetch messages without
the TciIngested keyword`"]
    FETCH --> INS{"`Insert InboundMessage
by RFC Message-ID`"}

    INS -->|"unique violation"| DUP["`Already seen — acknowledge, skip.
The database is the arbiter,
not the worker`"]
    INS -->|"inserted"| PARSE["`Deterministic parse
**no LLM** — §6.3`"]

    PARSE --> GAP{"`Claim type and
mandatory facts found?`"}
    GAP -->|no| REVIEW["`**NEEDS_REVIEW**
operator queue`"]
    GAP -->|yes| CREATE["`CasesService.create()
channel EMAIL · initiatedBy SYSTEM`"]

    CREATE --> MATCH{"`Policy number
matches?`"}
    MATCH -->|yes| LINKED["policyId set"]
    MATCH -->|no| FLAG["needsPolicyReview = true"]

    LINKED --> ATT["Attach email documents"]
    FLAG --> ATT
    ATT --> DONE["`**PROCESSED** → Case in the funnel`"]

    REVIEW --> OPS{"Operator"}
    OPS -->|"fixed the cause"| RETRY["`Retry — re-reads the email
from the mailbox`"]
    RETRY --> PARSE
    OPS -->|"not an FNOL"| IGN["`IGNORED — audited,
never deleted`"]

    style DUP fill:#eef2fb,stroke:#3b5bA9
    style REVIEW fill:#fdf0e3,stroke:#b5651d
    style DONE fill:#e8f4ea,stroke:#2d6a4f
```

The operator queue is now a screen — *FNOL intake* in the portal, with
`NEEDS_REVIEW` and `FAILED` leading the filters. Until it existed, the row was
written and nobody could see it.

The row is written **before** parsing, so an email nobody could understand still
leaves a trace. A claimant who emailed you believes they have notified you.

---

## 10. Small-claims fast-track

```mermaid
flowchart TD
    IN["Claim opened"] --> C1{"`Category in the tenant's
fast-track list?`"}
    C1 -->|no| STD["Standard mode"]
    C1 -->|yes| C2{"`Estimated amount ≤
tenant fast-track limit?`"}
    C2 -->|no| STD
    C2 -->|yes| C3{"`Any open fraud signal
at MEDIUM or above?`"}
    C3 -->|yes| STD
    C3 -->|no| C4{"`Evidence checklist
complete?`"}
    C4 -->|no| STD
    C4 -->|yes| FAST["`**DESK_REVIEW**
fast-track SLA · single adjuster
short-form report`"]

    FAST --> TRIG{"`Any escalation trigger
mid-flight?`"}
    TRIG -->|"`fraud flag · amount revised up ·
extraction inconsistency`"| UP["`Escalate one level:
video → site → expert`"]
    TRIG -->|none| OUT["Complete on fast-track"]
    UP --> STD

    style FAST fill:#e8f4ea,stroke:#2d6a4f
```

> **The thresholds are the firm's, set per tenant.** Categories and per-category
> ceilings live in firm configuration, alongside licensed mode and the
> working-day calendar — so a white-labelled insurer's claims are routed on that
> insurer's rules rather than a platform default.

> **Configuration gaps fail closed.** A category with no limit configured is not
> fast-tracked, and an unknown estimated amount is not treated as a small one.
> Medical is excluded ahead of the economic checks, so a small medical claim
> cannot slip through on value.

Mode changes are audited and disclosed in the report's methodology section
(PD 12.6) — the assessment mode is a *method*, and a reader is entitled to know
which one produced the figure.

---

## 11. Who may do what

```mermaid
flowchart LR
    subgraph EXT["Outside the firm"]
        CLM["`CLAIMANT
own case only`"]
    end

    subgraph FIRM["Adjusting firm — tenant scoped"]
        SUP["`SUPPORT_DESK
vet · request info
no fraud or behavioural data`"]
        ADJ["`ADJUSTER
assess · author reports`"]
        FA["`FIRM_ADMIN
config · audited reveals
cannot sign reports`"]
    end

    subgraph INS["Insurer tenant"]
        SIU["SIU_INVESTIGATOR"]
        CO["`COMPLIANCE_OFFICER
legal holds`"]
        SR["SHARIAH_REVIEWER"]
    end

    SA["SUPER_ADMIN"]

    CLM -->|"submit · amend · upload"| CASE["Case"]
    SUP -->|"vet"| CASE
    ADJ -->|"assess"| CLAIM["Claim"]
    FA -->|"link policy · reveal payout"| CASE
    SIU -->|"escalated only"| CLAIM
    CO -->|"hold · compliance events"| CLAIM
    SA -->|"cross-tenant"| CLAIM

    style EXT fill:#fdf0e3,stroke:#b5651d
    style INS fill:#eef2fb,stroke:#3b5bA9
```

Cross-tenant access raises `ForbiddenException`. A record belonging to another
tenant is indistinguishable from one that does not exist — an existence check,
not merely an access check.

---

## What is drawn here but not yet built

| Flow step | Status |
|---|---|
| Policy file feed from the insurer | Planned, gated on **G9** |
| Proactive flight-delay detection | Needs G9 data plus a WhatsApp channel |
| Local-LLM document validation | `validationStatus` is a labelled stub |
| AMLA/CTF screening at payee registration | Phase 5, the one **FAIL** in §3 |
| Site-visit **scheduling** | The router now sends a property loss over the firm's threshold to `SITE_VISIT` (MASTER_PLAN §2.4), but nothing schedules the visit, holds an appointment or tells the claimant when someone is coming |
