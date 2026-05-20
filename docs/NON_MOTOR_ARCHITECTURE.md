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

## FraudSignalProvider plugin pattern

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

## What's deferred (intentionally)

- **Site visit scheduling** — would extend `Session` with a `mode` enum
  (REMOTE | SITE_VISIT | HYBRID) or add a `SiteVisit` table.
- **Inventory itemisation** — `InventoryItem` model linked to `Claim`,
  with photo, brand, model, purchase date, claimed value, validated
  value. Critical for fire/burglary; defer until UI lands.
- **Tier triage / auto-settlement** — rule engine that promotes
  PARAMETRIC + low-value claims directly to APPROVED without an
  adjuster. Add when ≥1 real parametric provider is live.
- **Subrogation tracking** — `Claim.subrogationFlag` enum.
- **SIU auto-escalation rules** — currently status `ESCALATED_SIU`
  exists but transition rules are manual. Wire to `FraudSignal.severity
  = CRITICAL` later.
- **Frontend** — no UI changes in this branch. Next branch extends the
  FNOL form with a category selector, swaps the right-panel sections per
  category, and renders the evidence checklist + fraud signals.

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
