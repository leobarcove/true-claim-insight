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
