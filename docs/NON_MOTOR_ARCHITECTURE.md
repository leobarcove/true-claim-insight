# Non-Motor Claims Architecture

This document describes how the platform extends from a motor-only system
to handle non-motor general insurance claims (flood, fire, lightning,
burglary, personal accident, etc.) common in the Malaysian market.

It's the architectural reference for `feature/non-motor-claims`.

## Goals

1. **Type-safe polymorphism** — each claim category gets its own typed
   sub-table, no JSON blobs hiding fields the schema should validate.
2. **Pluggable fraud detection** — third-party data sources (MetMalaysia,
   JPS, satellite imagery, document forgery, repeat-claimant graph) plug
   in as `FraudSignalProvider` instances. Adding one does not touch the
   claim lifecycle.
3. **Data-driven evidence checklists** — each insurer can customize the
   required documents per claim category without code changes.
4. **Workflow compatibility** — the existing motor pipeline (FNOL → eKYC
   → video session → consent) remains intact. Non-motor reuses the same
   primitives, with category-specific evidence requirements and a parallel
   fraud-signal pipeline.

## International references

The design borrows directly from these proven systems:

| System | Country | What we borrowed |
| --- | --- | --- |
| **Shift Technology** | FR/US | Signal-producer pattern: each detector is independent and emits typed signals (provider, category, severity, confidence). Used by AXA, Generali, Mapfre. → `FraudSignal` table + `FraudSignalProvider` interface. |
| **Swiss Re parametric flood products** | Global | Automatic payout when rainfall at a postcode exceeds a threshold. → `FloodClaim.parametricTriggerMet` boolean, populated by a parametric provider. |
| **NFIP / FEMA** | USA | Elevation certificates and Flood Insurance Rate Maps anchor flood claims. → `FloodClaim.propertyElevationMeters`, `propertyFloorLevel`. |
| **EA / USGS** | UK / USA | Open flood gauge data with real-time readings. → `FloodClaim.jpsGaugeId` for cross-reference to JPS InfoBanjir. |
| **Tractable** | UK | AI estimates stored as separate `Assessment` rows linked to the claim, never overwriting fields. → Existing pattern, extended to fraud signals. |
| **Lemonade ("Maya"/"Jim")** | USA | Behavioural fraud signals from claimant interview. → Existing Hume / Parselmouth / MediaPipe pipeline, now categorised under `FraudCategory.BEHAVIOURAL`. |
| **Munich Re NatCatSERVICE** | DE | Linkage of individual claims to named catastrophe events. → `FloodClaim.metMalaysiaEventRef`. |
| **Sompo Japan** | JP | Satellite-imagery cross-check for declared flood events. → Future provider (`SentinelFloodImageryProvider`) — interface ready, integration deferred. |

## Verifying a Case before conversion

The checks that run over a submitted Case — and the non-motor replacement for
the motor-era Trinity engine — have their own document:
**`docs/CASE_VERIFICATION_ENGINE.md`**. It builds on the `FraudSignalProvider`
pattern below rather than replacing it, and explains why autonomy is a property
of the independent event source rather than of the model.

## Schema

### Polymorphic claim model

```
Claim (base — fields universal across categories)
  ├─ category: ClaimCategory          // MOTOR | FLOOD | FIRE | LIGHTNING | ...
  ├─ claimType: ClaimType?            // Only set when category=MOTOR
  ├─ ... (existing universal fields)
  ├─ floodClaim: FloodClaim?          // 1:1, populated iff category=FLOOD
  └─ fraudSignals: FraudSignal[]      // 0..N, written by providers

FloodClaim (1:1 per Claim where category=FLOOD)
  ├─ incidentStart / incidentEnd      // when flooding began/receded
  ├─ waterDepthCm, durationHours      // hydrology
  ├─ source: FloodSource              // RIVER_OVERFLOW | FLASH_FLOOD | ...
  ├─ propertyType, floorLevel, elevationMeters  // NFIP/FEMA-style anchors
  ├─ postcode, state, jpsGaugeId      // cross-reference keys
  ├─ parametricTriggerMet             // Swiss Re-style
  ├─ metMalaysiaEventRef              // Munich Re NatCat-style
  └─ buildingDamageRm, contentsDamageRm, vehicleDamageRm
```

Each future category (Fire, Lightning, Burglary, ...) adds its own 1:1
sub-table following the same pattern. The discriminator is `Claim.category`.

### Fraud signal log

```
FraudSignal (Shift Technology pattern — independent typed signal events)
  ├─ provider: string                 // "MetMalaysiaRainfall", "RepeatClaimantGraph", ...
  ├─ category: FraudCategory          // PARAMETRIC | IDENTITY | BEHAVIOURAL | DOCUMENT |
  │                                   //   NETWORK | ENVIRONMENTAL | INVENTORY | POLICY
  ├─ signalType: string               // free-form key within provider
  ├─ severity: SignalSeverity         // INFO | LOW | MEDIUM | HIGH | CRITICAL
  ├─ confidence: float                // 0..1
  ├─ message: string?                 // adjuster-facing summary
  └─ rawData: JSONB                   // provider-specific evidence
```

Signals are append-only. Re-running providers creates new rows; the UI
shows the most recent grouped by `provider`. A future fusion step combines
signals across providers into an aggregate fraud score per claim.

### Payee name check — a rule, deliberately not a provider (added 11 Aug 2026)

Intake captures two names for two reasons: `claimant-name` is whose claim it is,
`bank-account-holder` is where the money goes. Nothing requires them to match,
and until 11 Aug nothing compared them. `checkPayeeName` in `@tci/shared-types`
now does, and the adjuster's payout panel warns when they diverge.

It is **not** a `FraudSignalProvider`, and the reason is the rule stated above —
the interface is drawn where a vendor or regulatory decision could change. This
is a string comparison over two answers already in hand. It calls nothing, costs
nothing, needs no orchestrator run, and there is no second implementation anyone
would ever swap in. Making it a provider would buy indirection and a `FraudSignal`
row per case view in exchange for nothing.

Consequences worth being explicit about, because they are the trade:

- **It writes no `FraudSignal` row**, so a divergence is not part of any
  aggregate fraud score and leaves no append-only record. It is a live read of
  the current answers, recomputed on each view.
- **It never blocks.** Only `match` silences the warning; `mismatch` and
  `uncertain` both surface. Rejection stays a human decision.
- **It is pure — no Prisma, no I/O.** That is what lets the same function gate
  conversion in case-service later without a second copy drifting from the one
  the portal uses.

If a payee divergence ever needs to *score* rather than *warn* — feeding claim
triage, or evidencing a pattern across claims — that is the moment it becomes a
provider (`category: IDENTITY`), and the pure comparison stays where it is as
the provider's implementation.

### Evidence checklist

```
EvidenceRequirement (data-driven, per ClaimCategory + Tenant)
  ├─ tenantId: string?                // null = global default
  ├─ category: ClaimCategory
  ├─ documentType: DocumentType
  ├─ isMandatory: bool
  ├─ description: string?
  └─ sortOrder: int
```

Resolution at query time: tenant-specific rows override global defaults
for the same `(category, documentType)`. The `/claims/:id/evidence-
checklist` endpoint joins each requirement against uploaded `Document`s
and returns `satisfied: true/false`.

### Retention and anonymisation (added 6 Aug 2026)

Retention splits along the same ownership line as everything else: the claims
context purges documents and case records (case-service, nightly at 03:00), and
the identity context anonymises claimants (gateway, nightly at 04:00 — an hour
later, so documents naming a person are examined before identity is destroyed).

Anonymisation keeps the row and destroys the identity: name, birth date, email,
NRIC ciphertext, NRIC tail and — most importantly — the NRIC **blind index**,
which is an HMAC that would otherwise survive the plaintext and still match.
The phone number is replaced with a random token rather than nulled, because
the column is required, unique, and the natural key intake resolves by.

### Per-tenant configuration (added 6 Aug 2026)

Evidence requirements were the first thing made per-tenant; `Tenant.settings`
is now a validated surface carrying the rest — fast-track categories and
ceilings, working-day calendar state, licensed mode, branding.

The rule worth carrying: **configuration lives where the context that owns it
lives.** `Tenant` is identity-context data, so the settings writer is in the
gateway; case-service reads it to decide whether a gate blocks. The
data-ownership test enforces that split, and refused the first placement of
this service in case-service.

### Intake flows as data, and conversational channels (added 6 Aug 2026)

The guided intake conversation used to be hardcoded TypeScript, with one branch
expressed as a JS closure. That is unauthorable — a closure serialises to
nothing — so wording changes needed a deploy, and a second channel would have
meant forking the flow.

Structure now lives in `FlowDefinition` (versioned, tenant-scoped, `tenantId =
null` as the platform default) and wording in `FlowOverlay` (sparse, per channel
and per locale). The split is enforced by shape rather than convention: an
overlay type has no `next` and no `answerType`, so a channel cannot diverge into
asking different questions or storing different values. A choice override may
relabel a value the base step already defines, never add one — adding one would
change what can be stored, which is structure.

Three rules generalise beyond travel, and all three matter as fire and flood
arrive:

- **Mark what the rest of the system reads by name.** `system: true` protects
  `incident-date` (CSP deadline flags), `trip-start` (promoted to
  `Claim.tripStartDate`) and `bank-account-number` (keys the redaction set). An
  author removing one gets a refused publish rather than a flow that runs
  perfectly while a regulatory clock quietly stops.
- **Pin the version on the record, not the tenant.** `Case.flowDefinitionId` +
  `flowVersion` mean publishing an edit cannot rewrite an intake in flight.
  Overlays need no pin, because copy cannot move the cursor or invalidate an
  answer — which is what makes live copy correction safe.
- **A list of common answers must accept an uncommon one** (`allowOther`,
  added 18 Aug 2026). Travel learned this the expensive way: destination,
  airline and bank were free text and arrived as "SG", "MAS" and "CIMB" —
  unusable downstream. Offering the bounded set fixes that, but an option set
  that looks complete and is not is the documented failure of guided intake,
  and here it would also have invalidated every case already in flight. So a
  long list is offered *and* typeable, and only the first `CHOICE_DISPLAY_MAX`
  entries are shown — a readability limit, not a channel one, since Telegram
  will happily render a hundred buttons nobody reads.

  The exception is the one that matters for the property lines: **a step a
  branch routes on stays closed.** `evaluateNext` matches exact values, so free
  text on a cause-of-loss `switch` would fall to the default arm and send a
  claimant down the wrong peril with no error raised anywhere. A test enforces
  the exclusion rather than trusting an author to remember it.

**One conversation, more than one surface (added 18 Aug 2026).** A channel is
not limited to its thread. `ChannelCapabilities.formPrimitive` records what
richer surface it can escalate to — `webview` for Telegram (a Mini App showing
`claimant-web`), `native_form` for WhatsApp (Flows, rendered by Meta from Flow
JSON), `none` for the rest. They are not interchangeable, which is why this is
declared rather than inferred: a WhatsApp CTA-URL button looks like a webview
and leaves the app for the phone's browser, where nothing vouches for the
claimant.

Reaching a surface means answering one question: *who is this, and which
conversation are they already in?* The shape is the same on both channels —
**attested token → existing binding → scoped session** — and only the signature
differs, since Telegram signs the launch and we mint the Flow token ourselves.
`ConversationIdentity` carries the resolved `(channel, platformUserId)`, and
`bindingFor` **finds and never creates** for it: an attestation establishes who
someone is, not that they have a claim, and a conversation started here would
have skipped the consent notice the thread gives first.

The corollary is easy to get backwards. Where a surface shares the thread's
message stream — as a Mini App does, since both resolve one binding — an
outbound prompt must render for the **least** capable surface it can reach, or
someone who closes the window is left with a question the thread cannot answer.
A surface only earns its own rendering when it has its own stream, which is
what a Flow screen has and a Mini App does not.

Multi-way branching is a `switch` rule rather than nested binary branches,
specifically for the property lines: a cause-of-loss list fanning out to
per-peril steps reads as a table in an editor and as an unreadable ladder if
expressed as nested `branch`es.

Channels sit behind `ChannelAdapter`. An adapter knows how to *say* things on one
platform and nothing about what to say — deciding the next question, validating
and advancing the Case all happen once, above that line, against the pinned flow.
`ChannelCapabilities` records what each platform can physically render, including
`retainsPlaintext`, which is how the payout-details exposure on messaging
channels is tracked rather than assumed away (MASTER_PLAN §3.4).

**The PWA is a channel too (11 Aug 2026).** It was not, and the exception cost
more than it saved: the React page drove the flow itself, so it shared the rules
with Telegram and nothing else — no transcript, no `back`/`edit`, no route to a
human, and none of the fixes made on the messaging side. A web claimant who got
stuck could not be helped because there was nothing for an operator to open.

`WebChatAdapter` closes it, and needed almost no machinery. Every other adapter
*pushes*; web chat *pulls* — but `ConversationGateway.say()` already persists
each outbound message before sending it, so for a pull channel the stored row
**is** the delivery and `send` has nothing to do. Two things had to move
server-side, and both generalise to any future pull channel:

- **The open question rides on the transcript.** A push adapter is handed the
  step and draws its keyboard on the spot; a pull client has only what was
  persisted, and the transcript stores text, not choices. Resolving it in the
  browser would need the flow, the answers and the branching rules — the
  duplication being removed.
- **`synthesiseStep` rebuilds the questions that belong to no flow.** Consent and
  claim-type are asked before a Case exists, so nothing can render their options
  from the transcript. Consent is the one question with no alternative route: a
  claimant who cannot render "I agree" cannot claim at all.

Documents are the single genuine difference, and it is expressed rather than
papered over. A messaging platform holds the claimant's file and hands us a
reference to fetch; a browser posts the bytes to the upload endpoint, which
validates and stores them first. So a web turn carries `storedDocumentId`
instead of `mediaRef` — and the gateway resolves it **scoped to the Case**,
because that id is claimant-supplied input on a route that attaches evidence to
a claim. Unscoped, a guessed id could offer another claimant's document as proof.

### Operating the conversational channels

| Setting | Effect |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Unset ⇒ the Telegram channel is off entirely. Web chat needs no token; its transport is the claimant's own session. |
| `TELEGRAM_POLLING_ENABLED` | Must be `true` on **exactly one** instance per bot token. Two pollers each receive half the updates, which presents as claimants being *intermittently ignored* rather than as an outage — the hardest class of fault to diagnose from a bug report. Staging needs its own bot, not a second poller on the same one. |
| `CHAT_LLM_NORMALISER_ENABLED` | Off by default. Fallback-only interpretation of an answer that failed deterministic parsing; the model returns a value, never a decision, and every call writes a `TransferRecord` with no lawful basis (MASTER_PLAN §6.3, §6.18–6.19). **Date steps now reach it too** — they used to return before the fallback could run, so the one place a human is most likely to write something no grammar covers was the one place the model could not help. That widens what reaches Gemini to include free text typed at a date step. |

**Binding in development.** On Telegram, tap *Share my number*: no code is sent
and a typed number is refused, because the platform's own verified contact is
the identity control. The PWA binds from the session instead — the claimant
logged in, so the proof already happened and repeating it would be theatre.

**The operator side** is the adjuster-portal's conversations console
(`apps/adjuster-portal/src/pages/conversations/` +
`components/conversations/`): queue, transcript and claim context in three
panes, rebuilt 17 Aug 2026 (MASTER_PLAN §8, user-flow site §9d). Two
architectural facts it renders rather than invents: taking over sets the mode
to HANDOVER and the bot stands down until the conversation is handed back, and
an INTERNAL message is never sent to the claimant on any channel — the console
styles those facts loudly because the server enforcing them is not the same as
an operator knowing them.

### Web chat has two doors, and they identify differently

`/cases/new` is the signed-in one described above. **`/chat` is public** — the
web equivalent of messaging the WhatsApp number: open a link, start talking, no
account and no login page in front of the conversation.

The difference is attestation, and it is the only difference. `platformVerifiedPhone`
in `CHANNEL_CAPABILITIES` records which channels get identity from their
platform: a WhatsApp message can only come from the account that sent it, and
Telegram's `request_contact` returns a number that platform verified. A browser
attests nothing, so the public door asks for a number and proves it with a code
delivered over the **same WhatsApp business account** the intake channel uses —
one sender identity, no second vendor. That happens at exactly the point a
messaging binding resolves its platform-verified number, and `pendingPhone` /
`otpAttempts` on `ConversationBinding` hold the two states so a reload resumes
mid-verification.

**The binding is keyed on a signed session id, not a claimant**, with
`claimantId` null until the code is proved. That is what lets a conversation
exist before an identity does. The session token is not authentication: it names
a conversation and grants no claim access, because every claim read is scoped by
the claimant the binding does not yet have.

`InternalKeyGuard` exists for this one route — key only, no identity headers,
because a visitor has none to send. Access control has not been skipped; it has
moved into the conversation. Any route that *can* name its user should use
`InternalAuthGuard`.

Three controls sit on it, because the early turns spend money per WhatsApp
template message: edge rate limits, the per-phone limit in `OtpService`, and
`MAX_CODE_ATTEMPTS` burning the pending number rather than letting it be ground
against. The first cut of the edge limit was 20 turns a minute, which throttled
a *claimant* — sixteen questions plus a couple of validation retries passes
twenty. The money is defended where it is spent, not at the door.

The load-bearing detail: a channel answer goes through
`CasesService.patchAnswer`, not a fast path around it. Every compliance control
lives in that method — answer redaction, policy promotion, deadline warnings,
the audit row — and `assertAccess` is what proves a messaging sender cannot
reach another claimant's case.

## FraudSignalProvider plugin pattern

> **The pattern generalised.** `FraudSignalProvider` was the first instance of
> a shape now used wherever the platform meets something it does not control:
> an interface plus an injection token, with the concrete implementation bound
> in one module and every consumer depending on the interface. As at 5 Aug 2026
> the platform carries five —
>
> | Token | Implementations | Swaps without touching a caller |
> |---|---|---|
> | `FraudSignalProvider` | rainfall, repeat-claimant, behavioural | a new detector |
> | `LlmProvider` | Gemini, Ollama | offshore → in-country (§6.15) |
> | `SignatureProvider` | stub | SigningCloud |
> | `InboundMailSource` | IMAP | SES inbound, provider webhook |
> | `NotificationTransport` | SMTP (Mailhog / SES `ap-southeast-5`) | SMS, WhatsApp |
>
> The rule that makes it worth the indirection: the interface is drawn where a
> **vendor or regulatory decision** could change, not wherever a seam is
> convenient. Each of the five names a decision the plan expects to revisit —
> which is why the local-LLM switch and the SES region are configuration
> changes rather than rewrites.

### Interface

```ts
interface FraudSignalProvider {
  readonly name: string;                          // unique stable ID
  readonly appliesTo: ClaimCategory[];            // routing predicate
  readonly emits: FraudCategory[];                // metadata
  evaluate(ctx: FraudSignalContext): Promise<FraudSignalEmission[]>;
}
```

Each provider:
- Declares which claim categories it applies to (so the orchestrator skips
  irrelevant ones — a parametric weather check won't run on a burglary
  claim).
- Returns zero or more signal emissions per evaluation. One provider can
  emit multiple signals (e.g. "rainfall threshold met" + "satellite imagery
  confirms inundation").
- Is allowed to throw. The orchestrator isolates failures so one slow or
  broken provider never blocks others.

### Orchestrator

`FraudSignalOrchestrator.evaluateClaim(claimId)`:
1. Loads the claim with `claimant`, `adjuster`, `documents`, `floodClaim`
   relations.
2. Filters providers by `appliesTo.includes(claim.category)`.
3. Runs applicable providers in parallel via `Promise.allSettled`.
4. Persists each emission as a `FraudSignal` row.
5. Returns the persisted rows.

Providers run in parallel because they're independent. Sequential execution
would add latency; isolation via `allSettled` means failures degrade
gracefully (one bad signal, not a broken claim).

### Adding a provider

```ts
// 1. Implement the interface
@Injectable()
export class MetMalaysiaRainfallProvider implements FraudSignalProvider {
  readonly name = 'MetMalaysiaRainfall';
  readonly appliesTo = ['FLOOD', 'LIGHTNING'] as const;
  readonly emits = ['PARAMETRIC', 'ENVIRONMENTAL'] as const;

  async evaluate(ctx) {
    // ... query MetMalaysia API, compute signals ...
  }
}

// 2. Register in fraud-signals.module.ts
@Module({
  providers: [FraudSignalOrchestrator, MetMalaysiaRainfallProvider, ...],
})

// 3. Inject into the orchestrator constructor
constructor(prisma, mockBaseline, metMalaysia /* new */) {
  this.providers = [mockBaseline, metMalaysia];
}
```

That's it. No existing code changes. No claim-lifecycle changes.

## Roadmap of providers (not in this branch)

In approximate value order:

1. **`MetMalaysiaRainfallProvider`** — query
   [metmalaysia.gov.my](https://www.met.gov.my/) for hourly rainfall at the
   claim postcode. Threshold-met → PARAMETRIC signal.
2. **`MetMalaysiaLightningProvider`** — strike database within 500m of
   coords on incident date. Confirmed → strong signal supporting lightning
   claim; absent → high suspicion.
3. **`JpsGaugeProvider`** — pull JPS InfoBanjir flood gauge readings near
   the property; ENVIRONMENTAL signal if gauge exceeded danger level.
4. **`RepeatClaimantGraphProvider`** — graph traversal: claimant ↔ address
   ↔ bank account ↔ broker ↔ witness across claims. NETWORK signal for
   suspicious linkage density.
5. **`DocumentForgeryProvider`** — OCR + LLM cross-check Bomba/police
   report against claimant statement. DOCUMENT signal on contradiction.
6. **`SentinelFloodImageryProvider`** — Sentinel-2 / NASA MODIS satellite
   pull for declared flood events. ENVIRONMENTAL signal.
7. **`InventoryMarketValueProvider`** — cross-check claimed contents
   values against current Malaysian retail prices. INVENTORY signal on
   inflated values.
8. **`PolicyTimingProvider`** — flag claims filed within N days of policy
   purchase / sum-insured increase. POLICY signal.

## Workflow integration

The existing motor pipeline:

```
FNOL → eKYC → Live video → Documents → Trinity → Consent → Decision
```

Non-motor (e.g. flood) adds two parallel branches:

```
FNOL (with category=FLOOD)
   → Coverage check                  [deferred]
   → eKYC                            [reused]
   → Evidence intake (checklist)     [reused, with /evidence-checklist]
   → External verification           [NEW — FraudSignalOrchestrator]
   → Optional video session OR
     site visit                      [video reused, site visit deferred]
   → Trinity v2 + signal fusion      [trinity reused, fusion deferred]
   → SIU escalation (auto)           [status reused, trigger rules deferred]
   → Consent + decision              [reused]
```

The skeleton in this branch covers the **Evidence intake** and **External
verification** stages plus the schema for the rest. Site visits, tier
triage (auto-settle low-value claims with PARAMETRIC trigger), inventory
modelling, and subrogation are tracked as follow-on work.

## Quantum (added 6 Aug 2026)

`quantum/quantum.calculator.ts` turns an assessed loss into a recommended
figure. Relevant to this document because the deduction order is **shared
across every non-motor category** — fire, flood, burglary and property all
apply average, betterment and excess the same way, so the calculator is
category-agnostic and only its *inputs* differ per line.

Ordered deductions, each documented in the source with why it sits there:

```
assessed loss
  − depreciation      (indemnity basis only; refused on reinstatement)
  − betterment        (improvement beyond pre-loss condition)
  − condition of average   ← before the excess, or the insured bears
                             only a fraction of their own excess
  − salvage
  − excess            ← always last among the deductions
  = recommended, then capped at the sum insured
```

Where a category needs its own rule — a flood policy with a separate
sub-limit, say — it belongs in the *inputs* handed to the calculator
(`sumInsured` scoped to the affected section), not in a category-specific
branch inside it. The moment the arithmetic forks per category, the
orderings drift apart and the figures stop being comparable.

## What's deferred (intentionally)

- **Site visit scheduling** — would extend `Session` with a `mode` enum
  (REMOTE | SITE_VISIT | HYBRID) or add a `SiteVisit` table. *Note (6 Aug
  2026): the **routing** half now exists — `resolveAssessmentMode()` sends a
  property loss at or above the firm's per-category threshold to
  `SITE_VISIT` (MASTER_PLAN §2.4). What is still deferred is everything
  after that decision: no visit is scheduled, no appointment is held, and
  the claimant is not told when someone is coming. The claim page says the
  mode and stops there.*
- **Inventory itemisation** — `InventoryItem` model linked to `Claim`,
  with photo, brand, model, purchase date, claimed value, validated
  value. Critical for fire/burglary; defer until UI lands.
- **Tier triage / auto-settlement** — rule engine that promotes
  PARAMETRIC + low-value claims directly to APPROVED without an
  adjuster. Add when ≥1 real parametric provider is live. *Note (6 Aug
  2026): the assessment-mode router now decides how a claim is examined
  — desk review, video, site visit or expert — but it never decides the
  claim itself. Auto-settlement remains deliberately unbuilt; the firm
  recommends and the insurer decides.*
- **Subrogation tracking** — `Claim.subrogationFlag` enum.
- **SIU auto-escalation rules** — currently status `ESCALATED_SIU`
  exists but transition rules are manual. Wire to `FraudSignal.severity
  = CRITICAL` later.
- **Frontend** — *partially closed 6 Aug 2026.* The claim detail screen now
  carries the quantum worksheet panel, and a new *FNOL intake* screen works
  the inbound email queue. Still open: a category selector on the FNOL form,
  per-category right-panel sections, and rendering the evidence checklist and
  fraud signals.

## How to extend to other categories

Adding **Fire**:

1. Add `FireClaim` model mirroring `FloodClaim` — ignition source, building
   type, Bomba report ref, structural vs contents damage, etc.
2. Add a new migration for the table.
3. Create `apps/case-service/src/fire-claims/` with the same shape as
   `flood-claims/`.
4. Add evidence requirements for `FIRE` to the `EvidenceRequirement`
   seed (Bomba report mandatory, etc.).
5. Optionally add a `BombaReportParserProvider` to extract structured
   data from uploaded Bomba reports.

The pattern is mechanical. The first non-motor type (flood) is where the
design decisions live; subsequent types are mostly data modelling.
