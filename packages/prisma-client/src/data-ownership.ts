/**
 * DATA OWNERSHIP MAP — the single source of truth for which service may write
 * which table.
 *
 * Why this exists
 * ---------------
 * Every NestJS service imports the same Prisma client against the same
 * database, so by default any service can write any table. The architecture
 * audit (docs/MASTER_PLAN.md §4.3 A2) found that this had already happened:
 * video-service writes `claim` and `user`, risk-engine writes `document` and
 * `floodClaim`. The consequences are a schema change silently breaking three
 * services, and no owner to reason about invariants with.
 *
 * Rather than merging services (expensive) or relying on convention (rots),
 * ownership is declared here as data and enforced by a test that scans every
 * service's source for Prisma writes:
 * apps/case-service/src/common/data-ownership.spec.ts. A new violation fails CI
 * at review time rather than becoming next year's audit finding.
 *
 * Bounded contexts
 * ----------------
 * These are drawn along the lines the domain actually has, not the current
 * process boundaries — so they stay correct when services are split or merged
 * later. `identity` is served by api-gateway today and is the natural seam if
 * an identity-service is ever extracted.
 */

export type DataContext = 'identity' | 'claims' | 'assessment' | 'reference' | 'platform';

/** Which context owns each Prisma model (lower-camel model names). */
export const MODEL_OWNERSHIP: Record<string, DataContext> = {
  // identity — who someone is, and their access
  user: 'identity',
  userTenant: 'identity',
  tenant: 'identity',
  tenantAccessLog: 'identity',
  otpCode: 'identity',
  claimant: 'identity',

  // claims — the regulated engagement and its evidence
  claim: 'claims',
  case: 'claims',
  // SLA clocks measure the firm's own turnaround on a claim, so they belong to
  // the claims context alongside the engagement they time.
  slaPolicy: 'claims',
  slaClock: 'claims',
  // The firm's work product on a claim.
  adjusterReport: 'claims',
  // Who may decide a claim's outcome, and up to what value.
  authorityLimit: 'claims',
  // The insurer's instruction — where the regulated engagement begins.
  assignment: 'claims',
  // FNOL email intake. Owned by claims because it exists only to become a
  // Case, and the same service must own both or ingestion could create a
  // claim record it does not own.
  inboundMessage: 'claims',
  // Outbound notification delivery log. Platform-wide in subject but written
  // by case-service, which owns every event that currently triggers one —
  // same reasoning as retentionPolicy above.
  notificationLog: 'claims',
  // The firm's own working on what a loss is worth — claims context, and the
  // same service that owns the claim it hangs off.
  quantumWorksheet: 'claims',
  // How long claim records live; platform-wide but written by case-service.
  retentionPolicy: 'claims',
  // Who may do which adjusting work — the people side of the claims context.
  adjusterCompetency: 'claims',
  conflictDeclaration: 'claims',
  conflictAttestation: 'claims',
  cpdRecord: 'claims',
  backgroundScreening: 'claims',
  complianceEvent: 'claims',
  keyPerson: 'claims',
  fitProperAttestation: 'claims',
  workQualityReview: 'claims',
  bnmNotification: 'claims',
  feeScale: 'claims',
  timeEntry: 'claims',
  disbursement: 'claims',
  feeNote: 'claims',
  // Consent sits in `claims`, not `identity`, despite attaching to a person.
  // The distinction that matters is which context the fact serves: every purpose
  // captured here (claim processing, biometric analysis of an assessment, the
  // cross-border basis for assessing offshore) exists because a claim is being
  // handled, and the case-service is what must refuse to proceed without it.
  // If consent later spans purposes unrelated to a claim — marketing, say — it
  // becomes an identity concern and moves, along with its write path.
  consent: 'claims',
  consentNotice: 'claims',
  caseDocument: 'claims',
  document: 'claims',
  policy: 'claims',
  claimNote: 'claims',
  floodClaim: 'claims',
  travelClaim: 'claims',
  evidenceRequirement: 'claims',
  adjuster: 'claims',
  auditTrail: 'claims',

  // assessment — how a loss was examined and scored
  transferRecord: 'assessment',
  session: 'assessment',
  sessionClientInfo: 'assessment',
  videoUpload: 'assessment',
  deceptionScore: 'assessment',
  riskAssessment: 'assessment',
  trinityCheck: 'assessment',
  documentAnalysis: 'assessment',
  fraudSignal: 'assessment',

  // platform — cross-cutting infrastructure, not business data.
  // Only the encrypting service writes key material; a second encryptor would
  // read the same rows rather than create competing key versions.
  encryptionKey: 'platform',

  // reference — master data (motor legacy; see MASTER_PLAN scope note)
  vehicleMake: 'reference',
  vehicleModel: 'reference',
};

/** Which contexts each service is allowed to write. */
export const SERVICE_CONTEXTS: Record<string, DataContext[]> = {
  // 'platform': the gateway encrypts identity data (Claimant NRIC), so it is a
  // legitimate holder of key material — not an exception.
  'api-gateway': ['identity', 'reference', 'platform'],
  'case-service': ['claims', 'platform'],
  'video-service': ['assessment'],
  'risk-engine': ['assessment'],
};

/**
 * Known violations that predate enforcement. Each entry is a debt with an owner
 * and a removal plan — NOT a permanent exemption.
 *
 * This list is a ratchet: a CI test asserts it never grows. Adding an entry
 * requires deleting another, or a deliberate decision recorded in the plan.
 */
export interface OwnershipException {
  service: string;
  model: string;
  reason: string;
  /** How this violation gets removed. */
  resolution: string;
}

export const OWNERSHIP_EXCEPTIONS: OwnershipException[] = [
  {
    service: 'video-service',
    model: 'claim',
    reason: 'rooms.service.ts sets Claim.status = SCHEDULED and scheduledAssessmentTime directly',
    // Design settled: a case-service internal endpoint "schedule assessment"
    // (status via updateStatus semantics + the timestamp), called over the
    // internal API. Not rewired yet because the rooms flow needs Daily.co
    // credentials to run, and an unverifiable rewire ships nothing but risk.
    resolution: 'Call case-service PATCH /claims/:id/status over the internal channel',
  },
  {
    service: 'video-service',
    model: 'document',
    reason: 'uploads.service.ts stores the generated consent PDF as a claim Document',
    resolution: 'Call case-service POST /claims/:claimId/documents',
  },
  {
    service: 'video-service',
    model: 'user',
    reason: 'writes to the identity context while resolving session participants',
    resolution: 'Read-only lookup via case-service or the gateway; no writes',
  },
  {
    service: 'risk-engine',
    model: 'document',
    reason: 'document-processor and assessments write Document status/metadata after analysis',
    resolution: 'Expose a case-service endpoint for analysis results to update document state',
  },
  {
    service: 'risk-engine',
    model: 'floodClaim',
    reason: 'MetMalaysia provider sets FloodClaim.parametricTriggerMet',
    // Design settled: PATCH internal flood-claims/:id/parametric on
    // case-service. Awaits a runnable fraud-orchestrator flow to verify against.
    resolution: 'Emit the FraudSignal only; case-service applies the parametric flag',
  },
  {
    service: 'case-service',
    model: 'claimant',
    reason: 'resolveClaimantId upserts a Claimant by phone during case intake',
    resolution: 'Gateway resolves the claimant and passes claimantId; case-service stops writing identity',
  },
];

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

export const isWriteOperation = (operation: string): boolean => WRITE_OPERATIONS.has(operation);

export interface OwnershipVerdict {
  allowed: boolean;
  /** True when allowed only because of a declared legacy exception. */
  viaException: boolean;
  reason?: string;
}

/**
 * May `service` perform `operation` on `model`?
 *
 * Reads are always permitted — cross-context reads are a coupling smell but not
 * a correctness hazard, and forbidding them would require an API layer that
 * does not exist yet. Writes are what corrupt another context's invariants.
 */
export const checkOwnership = (
  service: string,
  model: string,
  operation: string
): OwnershipVerdict => {
  if (!isWriteOperation(operation)) return { allowed: true, viaException: false };

  const owner = MODEL_OWNERSHIP[model];
  if (!owner) {
    return {
      allowed: false,
      viaException: false,
      reason: `Model "${model}" has no declared owner. Add it to MODEL_OWNERSHIP in packages/prisma-client/src/data-ownership.ts.`,
    };
  }

  const permitted = SERVICE_CONTEXTS[service];
  if (!permitted) {
    return {
      allowed: false,
      viaException: false,
      reason: `Service "${service}" is not in SERVICE_CONTEXTS.`,
    };
  }

  if (permitted.includes(owner)) return { allowed: true, viaException: false };

  const exception = OWNERSHIP_EXCEPTIONS.find(e => e.service === service && e.model === model);
  if (exception) {
    return {
      allowed: true,
      viaException: true,
      reason: `${service} → ${model} is a declared legacy violation (${exception.reason}). Resolution: ${exception.resolution}`,
    };
  }

  return {
    allowed: false,
    viaException: false,
    reason:
      `${service} may not write "${model}" — that table belongs to the "${owner}" context ` +
      `while ${service} owns [${permitted.join(', ')}]. Call the owning service's API instead. ` +
      `See docs/MASTER_PLAN.md §4.3 A2.`,
  };
};
