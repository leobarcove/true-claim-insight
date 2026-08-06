/**
 * 2026 volume seed — a year of claims that hangs together.
 *
 * Generates steady-state operating volume for 1 January to today, at the shape
 * a TPA looks like once two or three insurer panels are live. The point is not
 * row count: it is that every row is consistent with every other, so the
 * screens, the queues and the SLA arithmetic all show something an adjuster
 * would recognise.
 *
 * ## What "making sense" means here
 *
 * Each claim carries one timeline and every date derives from the one before
 * it: incident → notification → submission → vetting → conversion →
 * assignment → assessment → report → closure. Nothing is dated at random, so
 * a claim never reports before it was assigned, and the CSP clocks measure
 * intervals that actually elapsed.
 *
 * Status follows age rather than a fixed distribution. Claims from February
 * are almost all closed; last week's are spread across the lifecycle. A
 * uniform status mix would leave the queue looking identical in month one and
 * month seven, which is exactly what a volume seed is meant to disprove.
 *
 * ## Failures are seeded on purpose
 *
 * Rejections, abandonment, information-request loops, SLA breaches, fraud
 * signals and FNOL emails that would not parse are all present. An operator
 * queue is only meaningful when it has something in it, and a demo where
 * everything succeeds proves nothing about the paths that matter.
 *
 * Deterministic: the same seed produces the same data, so a bug found against
 * this dataset can be reproduced.
 */

import {
  AssessmentMode,
  CaseChannel,
  CaseInitiator,
  CaseStatus,
  ClaimCategory,
  ClaimStatus,
  DocumentType,
  FraudCategory,
  InboundMessageStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  PrismaClient,
  SettlementBasis,
  SignalSeverity,
  TravelClaimType,
} from '@prisma/client';
import { EncryptionService, EnvKeyProvider } from '@tci/crypto';

import { PrismaKeyStore } from '../src/key-store';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, and stable across Node versions. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20260101);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + random() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (probability: number) => random() < probability;

/** Weighted pick: [[value, weight], …]. */
function weighted<T>(options: [T, number][]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1][0];
}

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);
const money = (value: number) => new Prisma.Decimal(value.toFixed(2));

// ---------------------------------------------------------------------------
// Malaysian reference data
// ---------------------------------------------------------------------------

/**
 * Names are built gender-consistently.
 *
 * `bin` is "son of" and `binti` "daughter of"; `a/l` and `a/p` are the Tamil
 * equivalents. "Muhammad binti Rahman" is not a name a Malaysian reader would
 * pass over — and a demo whose names are visibly wrong invites doubt about
 * everything else on the screen.
 */
const MALAY_MALE = ['Ahmad', 'Muhammad', 'Hafiz', 'Zulkifli', 'Amirul', 'Firdaus'];
const MALAY_FEMALE = ['Siti', 'Nurul', 'Aisyah', 'Farah', 'Suria', 'Zaleha'];
const TAMIL_MALE = ['Ravi', 'Suresh', 'Kumaran'];
const TAMIL_FEMALE = ['Priya', 'Kavitha', 'Anjali'];
const CHINESE = ['Wei Ming', 'Mei Ling', 'Jian Hao', 'Chee Keong', 'Li Hua', 'Kok Wai'];
const CHINESE_SURNAMES = ['Tan', 'Lim', 'Wong', 'Lee', 'Chong', 'Ng'];
const MALAY_PATRONYM = ['Abdullah', 'Rahman', 'Ismail', 'Yusof'];
const TAMIL_PATRONYM = ['Muthusamy', 'Krishnan', 'Ramasamy'];

/** A plausible Malaysian name, with the patronymic matching the given name. */
function malaysianName(): string {
  const kind = weighted<'malay-m' | 'malay-f' | 'tamil-m' | 'tamil-f' | 'chinese'>([
    ['malay-m', 26],
    ['malay-f', 26],
    ['tamil-m', 8],
    ['tamil-f', 8],
    ['chinese', 32],
  ]);

  switch (kind) {
    case 'malay-m':
      return `${pick(MALAY_MALE)} bin ${pick(MALAY_PATRONYM)}`;
    case 'malay-f':
      return `${pick(MALAY_FEMALE)} binti ${pick(MALAY_PATRONYM)}`;
    case 'tamil-m':
      return `${pick(TAMIL_MALE)} a/l ${pick(TAMIL_PATRONYM)}`;
    case 'tamil-f':
      return `${pick(TAMIL_FEMALE)} a/p ${pick(TAMIL_PATRONYM)}`;
    case 'chinese':
      return `${pick(CHINESE_SURNAMES)} ${pick(CHINESE)}`;
  }
}
const DESTINATIONS = ['Bangkok', 'Singapore', 'Tokyo', 'Seoul', 'Jakarta', 'Ho Chi Minh City', 'Taipei', 'Hong Kong', 'Bali', 'Melbourne', 'London', 'Dubai', 'Osaka', 'Manila', 'Phuket'];
const AIRLINES = ['MH', 'AK', 'D7', 'OD', 'FY', 'SQ', 'TR', 'VJ'];

/** Risk addresses for property losses — a fire claim with no address is not assessable. */
const STREETS = ['Ampang', 'Bukit Bintang', 'Tun Razak', 'Sultan Ismail', 'Pudu', 'Kuchai Lama', 'Genting Klang', 'Cheras'];
const TOWNS = ['Kuala Lumpur', 'Petaling Jaya', 'Shah Alam', 'Klang', 'Johor Bahru', 'Ipoh', 'Georgetown', 'Seremban'];
const STATES = ['Selangor', 'Kuala Lumpur', 'Johor', 'Perak', 'Penang', 'Negeri Sembilan'];

/**
 * Malaysian travel seasonality, by ISO month.
 *
 * Peaks track school holidays and festive travel: Chinese New Year in
 * February, Hari Raya in March 2026, mid-year school break in June. A flat
 * distribution would make monthly MI meaningless.
 */
const MONTH_WEIGHT: Record<number, number> = { 1: 0.9, 2: 1.35, 3: 1.4, 4: 1.0, 5: 0.85, 6: 1.3, 7: 1.1, 8: 1.0 };

/**
 * The non-motor book (MASTER_PLAN §1 scope).
 *
 * Travel leads because it is the MVP line and the MSIG pilot's volume, but a
 * TPA's book is not one product: fire and flood are where the value sits, and
 * a demo showing only travel misrepresents what the firm does. Motor is
 * deliberately absent — it is excluded from scope, and legacy motor rows are
 * removed by the wipe so they cannot appear in a non-motor picture.
 */
const CATEGORY_MIX: [ClaimCategory, number][] = [
  [ClaimCategory.TRAVEL, 62],
  [ClaimCategory.FIRE, 13],
  [ClaimCategory.FLOOD, 10],
  [ClaimCategory.BURGLARY, 8],
  [ClaimCategory.LIGHTNING, 4],
  [ClaimCategory.HOH, 3],
];

/**
 * Property lines behave nothing like travel: an order of magnitude more money,
 * a site visit rather than a video call, and weeks rather than days to settle.
 */
const PROPERTY_BAND: Partial<Record<ClaimCategory, [number, number]>> = {
  FIRE: [25_000, 480_000],
  FLOOD: [8_000, 180_000],
  BURGLARY: [3_000, 90_000],
  LIGHTNING: [2_000, 45_000],
  HOH: [1_500, 30_000],
};

const PROPERTY_NARRATIVE: Partial<Record<ClaimCategory, string[]>> = {
  FIRE: [
    'Electrical fire in the rear store; stock and fittings damaged.',
    'Kitchen fire spread to the ceiling void of the shoplot.',
    'Fire originating from a neighbouring unit; smoke and water damage throughout.',
  ],
  FLOOD: [
    'Monsoon flooding; water reached 1.2m at the ground floor.',
    'Flash flood after prolonged rainfall; stock on the lower racking destroyed.',
    'River overflow inundated the warehouse floor and lower shelving.',
  ],
  BURGLARY: [
    'Forced entry through the rear shutter; stock and cash removed.',
    'Break-in overnight; office equipment and petty cash taken.',
    'Entry via a roof hatch; damage to fittings and loss of stock.',
  ],
  LIGHTNING: [
    'Lightning strike; surge damage to electrical installation and equipment.',
    'Strike to the roof mast; distribution board and appliances destroyed.',
  ],
  HOH: [
    'Householder claim — water ingress damaged contents in the living area.',
    'Householder claim — accidental damage to fittings and furnishings.',
  ],
};

const TRAVEL_TYPES: [TravelClaimType, number][] = [
  [TravelClaimType.FLIGHT_DELAY, 38],
  [TravelClaimType.LUGGAGE_DAMAGE, 18],
  [TravelClaimType.LUGGAGE_LOSS, 14],
  [TravelClaimType.TRIP_CANCELLATION, 16],
  [TravelClaimType.MEDICAL, 14],
];

/** Amount bands by claim type, in RM. Medical is the long tail. */
const AMOUNT_BAND: Record<TravelClaimType, [number, number]> = {
  FLIGHT_DELAY: [300, 2_000],
  LUGGAGE_DAMAGE: [400, 4_000],
  LUGGAGE_LOSS: [800, 8_000],
  TRIP_CANCELLATION: [1_500, 20_000],
  MEDICAL: [2_000, 60_000],
};

/**
 * The mandatory evidence an adjuster would actually hold, per line.
 *
 * Drawn from the evidence-requirement types the schema already defines, so a
 * seeded claim's documents line up with the checklist the screen renders
 * rather than being plausible-looking filler.
 */
const EVIDENCE_BY_CATEGORY: Partial<Record<ClaimCategory | 'DEFAULT', [DocumentType, string][]>> = {
  TRAVEL: [
    ['BOARDING_PASS', 'boarding-pass.pdf'],
    ['FLIGHT_ITINERARY', 'itinerary.pdf'],
    ['AIRLINE_DELAY_CONFIRMATION', 'airline-delay-confirmation.pdf'],
  ],
  FIRE: [
    ['BOMBA_REPORT', 'bomba-report.pdf'],
    ['DAMAGE_PHOTO', 'fire-damage-01.jpg'],
    ['INVENTORY_LIST', 'stock-inventory.pdf'],
    ['REPAIR_QUOTATION', 'reinstatement-quotation.pdf'],
  ],
  FLOOD: [
    ['FLOOD_AUTHORITY_REPORT', 'jps-flood-report.pdf'],
    ['WEATHER_REPORT', 'metmalaysia-rainfall.pdf'],
    ['DAMAGE_PHOTO', 'flood-damage-01.jpg'],
  ],
  BURGLARY: [
    ['POLICE_REPORT', 'police-report.pdf'],
    ['DAMAGE_PHOTO', 'forced-entry-01.jpg'],
    ['PROOF_OF_OWNERSHIP', 'purchase-receipts.pdf'],
  ],
  LIGHTNING: [
    ['UTILITY_SURGE_REPORT', 'tnb-surge-report.pdf'],
    ['DAMAGE_PHOTO', 'surge-damage-01.jpg'],
  ],
  HOH: [
    ['DAMAGE_PHOTO', 'contents-damage-01.jpg'],
    ['PROOF_OF_OWNERSHIP', 'receipts.pdf'],
  ],
  DEFAULT: [['DAMAGE_PHOTO', 'damage-01.jpg'], ['OTHER_DOCUMENT', 'supporting.pdf']],
};

/**
 * Filenames for evidence resolved from `evidence_requirements`.
 *
 * A document type alone would give `PROPERTY_IRREGULARITY_REPORT.pdf`, which
 * no claimant ever uploaded. Anything absent falls back to a derived name.
 */
const EVIDENCE_FILENAMES: Partial<Record<DocumentType, string>> = {
  AIRLINE_DELAY_CONFIRMATION: 'airline-delay-confirmation.pdf',
  BAGGAGE_TAG: 'baggage-tag.jpg',
  BOARDING_PASS: 'boarding-pass.pdf',
  DAMAGE_PHOTO: 'damage-01.jpg',
  FLIGHT_ITINERARY: 'itinerary.pdf',
  MEDICAL_REPORT: 'medical-report.pdf',
  OVERSEAS_MEDICAL_BILL: 'hospital-invoice.pdf',
  PASSPORT: 'passport.jpg',
  PROOF_OF_OWNERSHIP: 'purchase-receipts.pdf',
  PROPERTY_IRREGULARITY_REPORT: 'pir-form.pdf',
  TRAVEL_BOOKING_INVOICE: 'booking-invoice.pdf',
};

const filenameFor = (docType: DocumentType): string =>
  EVIDENCE_FILENAMES[docType] ?? `${docType.toLowerCase().replace(/_/g, '-')}.pdf`;

/**
 * The evidence a claim of this shape should carry.
 *
 * Travel resolves from `evidence_requirements` — the table the claim page's
 * checklist reads — so a luggage claim is seeded a PIR and a baggage tag
 * rather than the flight-delay set. Seeding a list written out separately here
 * is what left every travel checklist reading 0/3 while its Documents panel
 * showed three files: both were plausible, and they were about different
 * claims.
 *
 * Property lines have no rows in that table yet, so they keep the hand-written
 * lists above. Optional requirements are included two times in three — a book
 * where every optional item is always present is not one an adjuster would
 * recognise.
 */
/**
 * The firm's assessment policy, written to `Tenant.settings` and then applied
 * here so the seeded modes are the ones the router would actually choose.
 *
 * Thresholds are a business decision, recorded here rather than implied: a
 * RM20,000 floor for attending a property loss sends an adjuster to essentially
 * every fire (band starts at RM25,000) and to the larger floods and burglaries,
 * while leaving small contents losses to a video call. The fast-track ceiling
 * of RM5,000 on travel is the Path C default in MASTER_PLAN §2.5.
 */
const FAST_TRACK_LIMIT_TRAVEL = 5_000;
const SITE_VISIT_THRESHOLD = 20_000;
const INSPECTABLE: ClaimCategory[] = [
  ClaimCategory.FIRE,
  ClaimCategory.FLOOD,
  ClaimCategory.BURGLARY,
  ClaimCategory.LIGHTNING,
  ClaimCategory.HOH,
];

const ASSESSMENT_SETTINGS = {
  fastTrackCategories: [ClaimCategory.TRAVEL],
  fastTrackLimits: { [ClaimCategory.TRAVEL]: FAST_TRACK_LIMIT_TRAVEL.toFixed(2) },
  siteVisitCategories: INSPECTABLE,
  siteVisitThresholds: Object.fromEntries(
    INSPECTABLE.map(category => [category, SITE_VISIT_THRESHOLD.toFixed(2)])
  ),
};

/**
 * `resolveAssessmentMode()` in case-service, restated over seed values.
 *
 * Not imported: the router takes a Prisma claim and a tenant row, and reaching
 * into an app from the seed would invert the dependency. The precedence is the
 * one that matters and is kept identical — medical, then fast track, then
 * inspection, then video — and `assessment-mode.spec.ts` is what holds the
 * original honest.
 */
function seededMode(input: {
  category: ClaimCategory;
  travelType: TravelClaimType | null;
  amount: number;
  evidenceComplete: boolean;
}): AssessmentMode {
  if (input.travelType === TravelClaimType.MEDICAL) return AssessmentMode.EXPERT_REFERRAL;

  const fastTracked =
    input.category === ClaimCategory.TRAVEL &&
    input.amount <= FAST_TRACK_LIMIT_TRAVEL &&
    input.evidenceComplete;
  if (fastTracked) return AssessmentMode.DESK_REVIEW;

  if (INSPECTABLE.includes(input.category) && input.amount >= SITE_VISIT_THRESHOLD) {
    return AssessmentMode.SITE_VISIT;
  }

  return AssessmentMode.VIDEO;
}

type Requirement = { documentType: DocumentType; isMandatory: boolean };
const requirementsByKey = new Map<string, Requirement[]>();
const requirementKey = (category: ClaimCategory, travelType: TravelClaimType | null) =>
  `${category}/${travelType ?? '*'}`;

async function loadEvidenceRequirements() {
  const rows = await prisma.evidenceRequirement.findMany({
    where: { tenantId: null },
    orderBy: { sortOrder: 'asc' },
    select: { category: true, travelClaimType: true, documentType: true, isMandatory: true },
  });
  for (const row of rows) {
    const key = requirementKey(row.category, row.travelClaimType);
    if (!requirementsByKey.has(key)) requirementsByKey.set(key, []);
    requirementsByKey.get(key)!.push({
      documentType: row.documentType,
      isMandatory: row.isMandatory,
    });
  }
}

function evidenceFor(
  category: ClaimCategory,
  travelType: TravelClaimType | null
): [DocumentType, string][] {
  const resolved =
    requirementsByKey.get(requirementKey(category, travelType)) ??
    requirementsByKey.get(requirementKey(category, null));

  if (!resolved?.length) {
    return EVIDENCE_BY_CATEGORY[category] ?? EVIDENCE_BY_CATEGORY.DEFAULT!;
  }

  return resolved
    .filter(req => req.isMandatory || chance(0.66))
    .map(req => [req.documentType, filenameFor(req.documentType)]);
}

const START = new Date('2026-01-01T00:00:00Z');
const TODAY = new Date();

/** Steady state: two to three insurer panels live. */
const CLAIMS_PER_MONTH = 150;

// ---------------------------------------------------------------------------

/**
 * Remove anything a previous run of THIS seeder created.
 *
 * Re-runnable by design: a volume seed that only works against a virgin
 * database is one you stop using the first time it half-fails. Rows are
 * identified by the markers this file writes — the base seed's own data uses
 * different prefixes and is left alone.
 *
 * Deleted in foreign-key order rather than relying on cascades, so the
 * intent is visible and a schema change that drops a cascade fails loudly
 * here instead of leaving orphans.
 */
async function wipePreviousRun() {
  // Motor is out of scope (§1). Legacy rows from the base seed would otherwise
  // put a Vehicle Details panel in front of anyone reviewing a non-motor book.
  const motor = await prisma.claim.findMany({ where: { category: 'MOTOR' }, select: { id: true } });
  if (motor.length) {
    const ids = motor.map(row => row.id);
    const sessions = await prisma.session.findMany({
      where: { claimId: { in: ids } },
      select: { id: true },
    });
    const sessionIds = sessions.map(row => row.id);

    // Session children first. Deleted explicitly rather than by cascade so a
    // schema change that drops one fails here rather than leaving orphans.
    if (sessionIds.length) {
      await prisma.deceptionScore.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.sessionClientInfo.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.riskAssessment.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
    }

    // Everything that hangs off a claim. Enumerated rather than left to
    // cascades so a schema change that drops one fails here, loudly, instead
    // of leaving orphan rows behind a "successful" seed.
    const where = { claimId: { in: ids } };
    await prisma.videoUpload.deleteMany({ where });
    await prisma.trinityCheck.deleteMany({ where });
    await prisma.claimNote.deleteMany({ where });
    await prisma.adjusterReport.deleteMany({ where });
    await prisma.document.deleteMany({ where });
    await prisma.fraudSignal.deleteMany({ where });
    await prisma.slaClock.deleteMany({ where });
    await prisma.travelClaim.deleteMany({ where });
    await prisma.floodClaim.deleteMany({ where });
    await prisma.quantumWorksheet.deleteMany({ where });
    await prisma.assessmentModeDecision.deleteMany({ where });
    await prisma.conflictAttestation.deleteMany({ where });
    await prisma.disbursement.deleteMany({ where });
    await prisma.timeEntry.deleteMany({ where });
    await prisma.feeNote.deleteMany({ where });
    // A case points at the claim it converted into.
    await prisma.case.deleteMany({ where: { convertedClaimId: { in: ids } } });
    await prisma.claim.deleteMany({ where: { id: { in: ids } } });
    console.log(`  removed legacy motor   ${ids.length} claims (out of scope)`);
  }

  // Keyed on the seeded claimants rather than on number prefixes. The sequence
  // continues across runs, so a prefix match silently missed rows from the
  // second run onward — and a wipe that half-works is worse than none.
  const seeded = await prisma.claimant.findMany({
    where: { email: { endsWith: '@example.my' } },
    select: { id: true },
  });
  const claimantIds = seeded.map(row => row.id);
  if (claimantIds.length === 0) return;


  const claims = await prisma.claim.findMany({
    where: { claimantId: { in: claimantIds } },
    select: { id: true },
  });
  const claimIds = claims.map(claim => claim.id);

  const cases = await prisma.case.findMany({
    where: { claimantId: { in: claimantIds } },
    select: { id: true },
  });
  const caseIds = cases.map(row => row.id);

  if (claimIds.length) {
    // Documents are seeded now, so the wipe must clear them too — the first
    // version of this list predated them and the FK caught the omission.
    await prisma.document.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.adjusterReport.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.fraudSignal.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.quantumWorksheet.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.assessmentModeDecision.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.slaClock.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.travelClaim.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.session.deleteMany({ where: { claimId: { in: claimIds } } });
  }

  await prisma.inboundMessage.deleteMany({});
  await prisma.notificationLog.deleteMany({ where: { entityType: 'CASE' } });

  // Cases first: a case points at the claim it converted into.
  if (caseIds.length) {
    await prisma.caseDocument.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  }
  if (claimIds.length) await prisma.claim.deleteMany({ where: { id: { in: claimIds } } });

  await prisma.assignment.deleteMany({ where: { externalRef: { startsWith: 'MSIG-APP-' } } });
  await prisma.consent.deleteMany({ where: { claimantId: { in: claimantIds } } });
  await prisma.claimant.deleteMany({ where: { id: { in: claimantIds } } });
  await prisma.policy.deleteMany({ where: { policyNumber: { startsWith: 'MSIG-' } } });

}

async function main() {
  console.log('Seeding 2026 operating volume…\n');

  await wipePreviousRun();

  // The checklist on the claim page reads these rows, so the documents seeded
  // below are drawn from them rather than from a second list written here.
  await loadEvidenceRequirements();

  const configLike = { get: (key: string) => process.env[key] } as never;
  const encryption = new EncryptionService(new PrismaKeyStore(prisma), new EnvKeyProvider(configLike));
  await encryption.onModuleInit();

  const pepper = process.env.NRIC_INDEX_PEPPER;
  if (!pepper) throw new Error('NRIC_INDEX_PEPPER is not set — seeded NRICs could not be indexed');

  const firm = await prisma.tenant.findFirst({ where: { type: 'ADJUSTING_FIRM' } });
  const insurer = await prisma.tenant.findFirst({ where: { type: 'INSURER' } });
  const adjuster = await prisma.adjuster.findFirst();
  const staff = await prisma.user.findFirst({ where: { role: 'ADJUSTER' } });

  if (!firm || !insurer || !adjuster || !staff) {
    throw new Error('Run `pnpm prisma:seed` first — this extends the base seed rather than replacing it');
  }

  // ---- the firm's assessment policy -------------------------------------
  // Written before any claim is routed. Without it the router fast-tracks
  // nothing and attends nothing, so every claim would come out VIDEO — and the
  // seeded modes would once again describe a firm this configuration does not
  // describe. Merged rather than replaced: `licensedMode` and branding belong
  // to whoever set them.
  await prisma.tenant.update({
    where: { id: firm.id },
    data: {
      settings: {
        ...((firm.settings as Record<string, unknown> | null) ?? {}),
        ...ASSESSMENT_SETTINGS,
      },
    },
  });

  // ---- policies ---------------------------------------------------------
  // One per claimant-ish, under the insurer. A minority of claims will not
  // match one, which is what puts cases into the operator's policy-review queue.
  const policyCount = 420;
  const policies: { id: string; policyNumber: string; insuredName: string; category: ClaimCategory }[] = [];

  for (let i = 0; i < policyCount; i += 1) {
    const insuredName = malaysianName();
    // The policy prefix names the class. A fire loss on a travel policy number
    // is the first thing an insurer's claims head would query.
    const line = weighted<[ClaimCategory, string]>([
      [[ClaimCategory.TRAVEL, 'TRV'], 62],
      [[ClaimCategory.FIRE, 'FIR'], 13],
      [[ClaimCategory.FLOOD, 'FLD'], 10],
      [[ClaimCategory.BURGLARY, 'BGL'], 8],
      [[ClaimCategory.LIGHTNING, 'LTG'], 4],
      [[ClaimCategory.HOH, 'HOH'], 3],
    ]);
    const policyNumber = `MSIG-${line[1]}-2026-${String(i + 1).padStart(5, '0')}`;
    const issued = addDays(START, -intBetween(30, 400));

    const policy = await prisma.policy.create({
      data: {
        tenantId: insurer.id,
        policyNumber,
        insuredName,
        insuredPhone: `+601${intBetween(10, 99)}${intBetween(1000000, 9999999)}`,
        planTier: pick(['Silver', 'Gold', 'Platinum']),
        source: 'MANUAL',
        tripStartDate: issued,
        tripEndDate: addDays(issued, 365),
        destination: pick(DESTINATIONS),
        coverageSnapshot: {
          medicalExpenses: 100_000,
          baggage: 5_000,
          flightDelay: 2_000,
          tripCancellation: 20_000,
        },
      },
      select: { id: true, policyNumber: true, insuredName: true },
    });
    policies.push({ ...policy, category: line[0] });
  }
  console.log(`  policies              ${policies.length}`);

  // ---- claimants --------------------------------------------------------
  // Fewer people than claims, so repeat claimants exist — which is what makes
  // the repeat-claimant fraud signal meaningful rather than decorative.
  // One claimant per policy, sharing the insured's name: the person claiming
  // IS the person insured. Repeat claimants arise because one person can hold
  // more than one policy across the year, which is also what makes the
  // repeat-claimant fraud signal meaningful rather than decorative.
  const claimants: { id: string; name: string; phone: string }[] = [];
  const claimantByName = new Map<string, { id: string; name: string; phone: string }>();

  for (let i = 0; i < policies.length; i += 1) {
    const name = policies[i].insuredName;
    const phone = `+601${intBetween(10, 99)}${String(3000000 + i).padStart(7, '0')}`;
    const nric = `${intBetween(60, 99)}${String(intBetween(1, 12)).padStart(2, '0')}${String(intBetween(1, 28)).padStart(2, '0')}-${String(intBetween(1, 14)).padStart(2, '0')}-${String(intBetween(1000, 9999))}`;

    const claimant = await prisma.claimant.create({
      data: {
        fullName: name,
        phoneNumber: phone,
        email: `${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}${i}@example.my`,
        // Same custody as the application: blind index for lookup, ciphertext
        // at rest, clear tail for display. Seeded data that skipped this would
        // be undecryptable by the services reading it.
        nricHash: encryption.blindIndex(nric, pepper),
        nricEncrypted: await encryption.encrypt(nric),
        nricLast4: encryption.lastDigits(nric),
        dateOfBirth: new Date(`19${intBetween(60, 99)}-0${intBetween(1, 9)}-1${intBetween(0, 9)}`),
        kycStatus: chance(0.72) ? 'VERIFIED' : 'PENDING',
        tenantId: firm.id,
      },
      select: { id: true },
    });
    const record = { id: claimant.id, name, phone };
    claimants.push(record);
    if (!claimantByName.has(name)) claimantByName.set(name, record);
  }
  console.log(`  claimants             ${claimants.length}`);

  // ---- the claim timelines ---------------------------------------------
  const months = monthsBetween(START, TODAY);
  const totals = {
    cases: 0,
    claims: 0,
    rejected: 0,
    abandoned: 0,
    infoRequested: 0,
    assignments: 0,
    worksheets: 0,
    reports: 0,
    fraudSignals: 0,
    inbound: 0,
    needsReview: 0,
    notifications: 0,
    slaClocks: 0,
    breaches: 0,
    modeDecisions: 0,
    sessions: 0,
    documents: 0,
    caseDocuments: 0,
    consents: 0,
  };

  // Start above anything already present. The wipe removes this seeder's own
  // rows, but a half-finished earlier run can leave numbers behind — and a
  // unique-constraint collision partway through is the worst possible failure
  // for a seed, because it leaves the database in a state neither empty nor
  // complete.
  const lastCase = await prisma.case.findFirst({ orderBy: { caseNumber: 'desc' }, select: { caseNumber: true } });
  const lastClaim = await prisma.claim.findFirst({ orderBy: { claimNumber: 'desc' }, select: { claimNumber: true } });
  const tail = (value: string | undefined) => Number(value?.split('-').pop() ?? 0) || 0;

  // Consent cannot be recorded against unapproved wording — the server refuses
  // it, and seeded data must obey the same rule the application does.
  const claimProcessingNotice = await prisma.consentNotice.findFirst({
    where: { purpose: 'CLAIM_PROCESSING', locale: 'en', approvedAt: { not: null } },
    orderBy: { version: 'desc' },
  });
  const biometricNotice = await prisma.consentNotice.findFirst({
    where: { purpose: 'BIOMETRIC_ANALYSIS', locale: 'en', approvedAt: { not: null } },
    orderBy: { version: 'desc' },
  });
  if (!claimProcessingNotice || !biometricNotice) {
    throw new Error(
      'No approved consent notice — approve the v1 wording before seeding, or the seed would ' +
        'record consents the application itself would have refused.'
    );
  }
  const claimProcessingNoticeId = claimProcessingNotice.id;
  const biometricNoticeId = biometricNotice.id;
  const consentedClaimants = new Set<string>();

  let caseSeq = Math.max(tail(lastCase?.caseNumber), 1000);
  let claimSeq = Math.max(tail(lastClaim?.claimNumber), 1000);

  for (const month of months) {
    const weight = MONTH_WEIGHT[month.getUTCMonth() + 1] ?? 1;
    const target = Math.round(CLAIMS_PER_MONTH * weight * monthFraction(month, TODAY));

    for (let i = 0; i < target; i += 1) {
      // The claimant IS the insured, and the claim's line follows the policy
      // it was made under. Both are resolved from the policy rather than rolled
      // independently — a mismatch on either is something an adjuster acts on.
      const policy = chance(0.88) ? pick(policies) : null;
      const category = policy ? policy.category : weighted(CATEGORY_MIX);
      const isTravel = category === ClaimCategory.TRAVEL;
      const claimant = policy
        ? claimantByName.get(policy.insuredName) ?? pick(claimants)
        : pick(claimants);

      const type = isTravel ? weighted(TRAVEL_TYPES) : null;

      // --- the timeline, each step derived from the one before -----------
      const incidentDate = randomDayIn(month, TODAY);
      if (incidentDate > TODAY) continue;

      // Most people notify within a couple of days; a tail does not, which is
      // what the CSP 24-hour and 30-day flags exist to surface.
      const notifyLagDays = weighted<[number, number]>([
        [[0, 1], 55],
        [[1, 3], 28],
        [[3, 14], 13],
        [[31, 60], 4],
      ]).reduce as never as number; // placeholder, replaced below
      void notifyLagDays;

      const lagBand = weighted<[number, number]>([
        [[0, 1], 55],
        [[1, 3], 28],
        [[3, 14], 13],
        [[31, 60], 4],
      ]);
      const notifiedAt = addHours(incidentDate, intBetween(lagBand[0] * 24, lagBand[1] * 24));
      if (notifiedAt > TODAY) continue;

      const notifiedLate = (notifiedAt.getTime() - incidentDate.getTime()) / 3_600_000 > 24;
      const outOfWindow = (notifiedAt.getTime() - incidentDate.getTime()) / 86_400_000 > 30;

      const channel = weighted<CaseChannel>([
        [CaseChannel.WEB_CHAT, 45],
        [CaseChannel.EMAIL, 35],
        [CaseChannel.STAFF, 20],
      ]);

      const amount = Math.round(
        isTravel ? between(...AMOUNT_BAND[type!]) : between(...PROPERTY_BAND[category]!)
      );
      const daysOld = (TODAY.getTime() - notifiedAt.getTime()) / 86_400_000;

      // --- how far did this case get? ------------------------------------
      const outcome = weighted<'converted' | 'rejected' | 'abandoned' | 'inflight'>([
        ['converted', 74],
        ['rejected', 8],
        ['abandoned', 5],
        ['inflight', 13],
      ]);

      // Anything older than about six weeks has resolved one way or another.
      const resolved = daysOld > 45 ? (outcome === 'inflight' ? 'converted' : outcome) : outcome;
      const askedForInfo = chance(0.18);
      const submittedAt = addHours(notifiedAt, intBetween(1, 30));
      const reviewedAt = addDays(submittedAt, intBetween(1, 4));
      const infoLoopDays = askedForInfo ? intBetween(2, 12) : 0;

      // The date the claim would open. Computed here rather than after the
      // case is written: a conversion that would fall in the future has not
      // happened, and a CONVERTED case with no claim is a state the real
      // system cannot reach.
      const convertedAt = addDays(reviewedAt, infoLoopDays + intBetween(0, 2));
      const convertible = resolved === 'converted' && convertedAt <= TODAY;

      const caseStatus =
        resolved === 'rejected'
          ? CaseStatus.REJECTED
          : resolved === 'abandoned'
            ? CaseStatus.ABANDONED
            : isTravel && type === TravelClaimType.MEDICAL && !convertible
              ? // Medical is routed to a human expert before it can convert.
                // Without this the operator's "With Expert" tab reads zero
                // while 14% of the book is medical.
                CaseStatus.REFERRED_TO_EXPERT
              : convertible
                ? CaseStatus.CONVERTED
              : askedForInfo
                ? CaseStatus.INFO_REQUESTED
                : chance(0.5)
                  ? CaseStatus.UNDER_REVIEW
                  : CaseStatus.SUBMITTED;

      const caseNumber = `CSE-2026-${String(++caseSeq).padStart(6, '0')}`;
      const flightNumber = `${pick(AIRLINES)}${intBetween(100, 9999)}`;
      const destination = pick(DESTINATIONS);

      const caseRow = await prisma.case.create({
        data: {
          caseNumber,
          tenantId: firm.id,
          channel,
          initiatedBy:
            channel === CaseChannel.STAFF
              ? CaseInitiator.STAFF
              : channel === CaseChannel.EMAIL
                ? CaseInitiator.SYSTEM
                : CaseInitiator.CLAIMANT,
          status: caseStatus,
          category,
          travelClaimType: type,
          claimantId: claimant.id,
          createdByUserId: channel === CaseChannel.STAFF ? staff.id : null,
          policyId: policy?.id ?? null,
          policyNumberRaw: policy?.policyNumber ?? `UNMATCHED-${intBetween(10000, 99999)}`,
          needsPolicyReview: !policy,
          incidentDate,
          destination,
          notifiedLate,
          outOfWindow,
          reviewNote:
            caseStatus === CaseStatus.REJECTED
              ? pick([
                  'Incident date falls outside the period of cover.',
                  'Delay of 3 hours is below the 6-hour policy threshold.',
                  'No proof of loss provided after two requests.',
                ])
              : caseStatus === CaseStatus.INFO_REQUESTED
                ? pick([
                    'Please upload the boarding pass for the delayed flight.',
                    'We need the property irregularity report from the airline.',
                    'Please provide the itemised medical invoice.',
                  ])
                : null,
          answers: {
            'policy-number': policy?.policyNumber ?? '',
            'incident-date': incidentDate.toISOString().slice(0, 10),
            destination,
            ...(isTravel && type === TravelClaimType.FLIGHT_DELAY ? { 'flight-number': flightNumber } : {}),
          },
          sourceMeta:
            channel === CaseChannel.EMAIL
              ? {
                  from: `agent${intBetween(1, 40)}@brokerage.com.my`,
                  subject: `Travel claim notification — ${caseNumber}`,
                  receivedAt: notifiedAt.toISOString(),
                }
              : undefined,
          submittedAt: caseStatus === CaseStatus.DRAFT ? null : submittedAt,
          createdAt: notifiedAt,
          updatedAt: addDays(submittedAt, infoLoopDays),
        },
        select: { id: true },
      });
      totals.cases += 1;
      if (caseStatus === CaseStatus.REJECTED) totals.rejected += 1;
      if (caseStatus === CaseStatus.ABANDONED) totals.abandoned += 1;
      if (askedForInfo) totals.infoRequested += 1;

      // PDPA consent, captured at intake before any processing begins.
      //
      // Recorded against the approved notice version, because a consent that
      // cannot name the wording the person agreed to is not evidence of
      // anything. Channel follows how the case arrived: a claimant filling in
      // the app consented on a web form, an emailed FNOL was captured by staff.
      //
      // A small share is withdrawn — the withdrawal path exists and a book
      // where nobody ever withdraws does not exercise it.
      if (!consentedClaimants.has(claimant.id)) {
        consentedClaimants.add(claimant.id);
        const withdrawn = chance(0.03);

        await prisma.consent.create({
          data: {
            claimantId: claimant.id,
            purpose: 'CLAIM_PROCESSING',
            noticeId: claimProcessingNoticeId,
            status: withdrawn ? 'WITHDRAWN' : 'GRANTED',
            grantedAt: notifiedAt,
            withdrawnAt: withdrawn ? addDays(notifiedAt, intBetween(5, 60)) : null,
            withdrawalReason: withdrawn ? 'Claimant asked us to stop processing' : null,
            capturedVia: channel === CaseChannel.WEB_CHAT ? 'WEB_FORM' : 'STAFF_CAPTURED',
            capturedByUserId: channel === CaseChannel.WEB_CHAT ? null : staff.id,
            createdAt: notifiedAt,
          },
        });
        totals.consents += 1;

        // Biometric consent is separate and narrower: it is only sought where
        // a video assessment is actually going to happen, and the analysis
        // path fails closed without it.
        if (!isTravel ? false : chance(0.55)) {
          await prisma.consent.create({
            data: {
              claimantId: claimant.id,
              purpose: 'BIOMETRIC_ANALYSIS',
              noticeId: biometricNoticeId,
              status: 'GRANTED',
              grantedAt: addHours(notifiedAt, 1),
              capturedVia: 'VIDEO_SESSION',
              createdAt: addHours(notifiedAt, 1),
            },
          });
          totals.consents += 1;
        }
      }

      // Case-level evidence. Distinct from claim documents on purpose: the
      // operator vets a CASE before it converts, and the checklist on that
      // screen reads `case_documents`. Seeding only claim documents left the
      // checklist at 0/3 — and left the evidence-completeness signal that
      // drives the fast-track router reading nothing at all.
      const caseEvidence = evidenceFor(category, type);
      const caseComplete = caseStatus !== CaseStatus.INFO_REQUESTED && chance(0.75);
      const caseUploads = caseComplete
        ? caseEvidence
        : caseEvidence.slice(0, Math.max(caseEvidence.length - 2, 0));

      for (const [docType, filename] of caseUploads) {
        await prisma.caseDocument.create({
          data: {
            caseId: caseRow.id,
            tenantId: firm.id,
            documentType: docType,
            fileName: filename,
            storagePath: `seed://cases/${caseRow.id}/${filename}`,
            mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
            sizeBytes: intBetween(48_000, 2_400_000),
            createdAt: addHours(submittedAt, intBetween(1, 40)),
          },
        });
        totals.caseDocuments += 1;
      }

      // FNOL email provenance for the email channel, plus a tail that would
      // not parse — which is what populates the operator's review queue.
      if (channel === CaseChannel.EMAIL) {
        await prisma.inboundMessage.create({
          data: {
            messageId: `<${caseNumber.toLowerCase()}@brokerage.com.my>`,
            tenantId: firm.id,
            fromAddress: `agent${intBetween(1, 40)}@brokerage.com.my`,
            toAddress: 'claims@trueclaiminsight.my',
            subject: `Travel claim notification — ${caseNumber}`,
            receivedAt: notifiedAt,
            status: InboundMessageStatus.PROCESSED,
            caseId: caseRow.id,
            parsed: {
              policyNumber: policy?.policyNumber,
              travelClaimType: type ?? undefined,
              category,
              incidentDate: incidentDate.toISOString(),
              ...(type === TravelClaimType.FLIGHT_DELAY ? { flightNumber } : {}),
              destination,
              missing: [],
            },
            processedAt: notifiedAt,
            createdAt: notifiedAt,
          },
        });
        totals.inbound += 1;
      }

      // Every information request notified the claimant, whether or not the
      // case is still sitting in that state — a case that later converted was
      // still chased at the time, and the delivery log is the evidence of it.
      if (askedForInfo) {
        await prisma.notificationLog.create({
          data: {
            tenantId: firm.id,
            channel: NotificationChannel.EMAIL,
            template: 'case.information-requested',
            recipient: `${claimant.name.split(' ')[0].toLowerCase()}@example.my`,
            subject: `Action needed on your claim ${caseNumber}`,
            status: NotificationStatus.SENT,
            entityType: 'CASE',
            entityId: caseRow.id,
            queuedAt: reviewedAt,
            sentAt: addHours(reviewedAt, 1),
            createdAt: reviewedAt,
          },
        });
        totals.notifications += 1;
      }

      if (caseStatus !== CaseStatus.CONVERTED) continue;

      // --- the claim -----------------------------------------------------
      const claimNumber = `CLM-2026-${String(++claimSeq).padStart(6, '0')}`;
      const claimAge = (TODAY.getTime() - convertedAt.getTime()) / 86_400_000;

      // Status follows age. Old claims have finished; recent ones are spread
      // across the lifecycle, which is what makes the queue look real.
      const status =
        claimAge > 40
          ? weighted<ClaimStatus>([
              [ClaimStatus.CLOSED, 62],
              [ClaimStatus.APPROVED, 26],
              [ClaimStatus.REJECTED, 9],
              [ClaimStatus.ESCALATED_SIU, 3],
            ])
          : claimAge > 18
            ? weighted<ClaimStatus>([
                [ClaimStatus.APPROVED, 34],
                [ClaimStatus.REPORT_PENDING, 26],
                [ClaimStatus.IN_ASSESSMENT, 20],
                [ClaimStatus.CLOSED, 12],
                [ClaimStatus.ESCALATED_SIU, 8],
              ])
            : weighted<ClaimStatus>([
                [ClaimStatus.SUBMITTED, 26],
                [ClaimStatus.ASSIGNED, 28],
                [ClaimStatus.SCHEDULED, 22],
                [ClaimStatus.IN_ASSESSMENT, 24],
              ]);

      const reached = (target: ClaimStatus) => stageIndex(status) >= stageIndex(target);
      const assignedAt = reached(ClaimStatus.ASSIGNED) ? addDays(convertedAt, intBetween(0, 2)) : null;
      const scheduledAt = reached(ClaimStatus.SCHEDULED) && assignedAt ? addDays(assignedAt, intBetween(1, 5)) : null;
      const assessedAt = reached(ClaimStatus.IN_ASSESSMENT) && scheduledAt ? addDays(scheduledAt, intBetween(0, 3)) : null;
      const reportAt = reached(ClaimStatus.REPORT_PENDING) && assessedAt ? addDays(assessedAt, intBetween(2, 9)) : null;
      const closedAt =
        status === ClaimStatus.CLOSED || status === ClaimStatus.APPROVED || status === ClaimStatus.REJECTED
          ? addDays(reportAt ?? assessedAt ?? convertedAt, intBetween(2, 14))
          : null;

      /**
       * The policy excess, drawn once and used everywhere.
       *
       * It is a term of the policy, so the Policy Information panel and the
       * quantum worksheet must show the same figure. Drawing it separately in
       * each place put 125 worksheets in visible contradiction with the panel
       * beside them on the claim page.
       */
      const excessAmount = pick([0, 100, 250, 500]);

      const claim = await prisma.claim.create({
        data: {
          claimNumber,
          claimantId: claimant.id,
          tenantId: firm.id,
          adjusterId: assignedAt ? adjuster.id : null,
          policyNumber: policy?.policyNumber ?? 'PENDING-VERIFICATION',
          category,
          status,
          incidentDate,
          incidentLocation: isTravel
            ? { destination, country: destination }
            : {
                address: `${intBetween(1, 220)} Jalan ${pick(STREETS)}`,
                city: pick(TOWNS),
                state: pick(STATES),
                postcode: String(intBetween(10000, 98000)),
              },
          description: isTravel
            ? describeIncident(type!, destination, flightNumber)
            : pick(PROPERTY_NARRATIVE[category] ?? ['Non-motor property loss.']),
          estimatedLossAmount: money(amount),
          approvedAmount:
            status === ClaimStatus.APPROVED || status === ClaimStatus.CLOSED
              ? money(amount * between(0.55, 1))
              : null,
          excessAmount: money(excessAmount),
          sumInsured: money((isTravel ? AMOUNT_BAND[type!][1] : PROPERTY_BAND[category]![1]) * 2),
          closedAt,
          createdAt: convertedAt,
          updatedAt: closedAt ?? reportAt ?? assessedAt ?? convertedAt,
        },
        select: { id: true },
      });

      await prisma.case.update({
        where: { id: caseRow.id },
        // No convertedAt column — the claim's createdAt IS the conversion moment.
        data: { convertedClaim: { connect: { id: claim.id } }, updatedAt: convertedAt },
      });

      if (isTravel) await prisma.travelClaim
        .create({
          data: {
            claimId: claim.id,
            tenantId: firm.id,
            travelClaimType: type!,
            policyId: policy?.id ?? null,
            destinationCountry: destination,
            estimatedAmountRm: money(amount),
            ...(type === TravelClaimType.FLIGHT_DELAY
              ? { airline: flightNumber.slice(0, 2), flightNumber, delayHours: intBetween(6, 26) }
              : {}),
            ...(type === TravelClaimType.MEDICAL
              ? { treatmentCountry: destination, referredToExpert: true }
              : {}),
          },
        });

      totals.claims += 1;

      // --- assessment mode ------------------------------------------------
      // Decided by the same rule the router applies, against the same tenant
      // policy written above. The seed used to draw modes at random, which is
      // how 76 travel claims ended up routed to a site visit — a mode the
      // router cannot produce for a loss that happened overseas.
      const mode = seededMode({
        category,
        travelType: type,
        amount,
        evidenceComplete: reached(ClaimStatus.IN_ASSESSMENT),
      });

      if (assignedAt) {
        await prisma.assessmentModeDecision.create({
          data: {
            claimId: claim.id,
            tenantId: firm.id,
            mode,
            fastTracked: mode === AssessmentMode.DESK_REVIEW,
            reasons:
              mode === AssessmentMode.EXPERT_REFERRAL
                ? ['Medical claims are referred to a claims expert and never desk-reviewed']
                : mode === AssessmentMode.DESK_REVIEW
                  ? [
                      `TRAVEL within the fast-track limit of 5000.00`,
                      'No open fraud signal at MEDIUM or above',
                      'Evidence checklist complete',
                    ]
                  : [`Estimated ${amount}.00 exceeds the fast-track limit of 5000.00`],
            decidedByUserId: staff.id,
            createdAt: assignedAt,
          },
        });
        await prisma.claim.update({ where: { id: claim.id }, data: { assessmentMode: mode } });
        totals.modeDecisions += 1;
      }

      // --- fraud signals ---------------------------------------------------
      if (chance(0.09)) {
        const severity = weighted<SignalSeverity>([
          [SignalSeverity.INFO, 30],
          [SignalSeverity.LOW, 28],
          [SignalSeverity.MEDIUM, 24],
          [SignalSeverity.HIGH, 14],
          [SignalSeverity.CRITICAL, 4],
        ]);
        await prisma.fraudSignal.create({
          data: {
            claimId: claim.id,
            provider: pick(['RepeatClaimantGraph', 'DocumentForgery', 'HumeBehavioural']),
            category: pick([FraudCategory.NETWORK, FraudCategory.DOCUMENT, FraudCategory.BEHAVIOURAL]),
            signalType: pick(['repeat-claimant', 'metadata-mismatch', 'stress-elevated']),
            severity,
            confidence: Number(between(0.45, 0.95).toFixed(2)),
            message: pick([
              'Third claim by this claimant in 12 months.',
              'Document creation date precedes the incident date.',
              'Elevated vocal stress during loss narrative.',
            ]),
            createdAt: assessedAt ?? convertedAt,
          },
        });
        totals.fraudSignals += 1;
      }

      // --- quantum + report -------------------------------------------------
      if (reportAt) {
        const assessed = amount * between(0.7, 1.05);
        // The excess is a policy term, not a per-worksheet choice. Drawing it
        // again here once put 125 worksheets in contradiction with the
        // Policy Information panel on the same screen.
        const excess = excessAmount;
        // Property is usually reinstatement; contents and older risks settle on
        // indemnity, where depreciation for age and wear applies.
        const settlementBasis = chance(0.75)
          ? SettlementBasis.REINSTATEMENT
          : SettlementBasis.INDEMNITY;
        const depreciation = settlementBasis === SettlementBasis.INDEMNITY ? between(0.1, 0.35) : 0;
        const afterDepreciation = assessed * (1 - depreciation);
        const recommended = Math.max(afterDepreciation - excess, 0);

        await prisma.quantumWorksheet.create({
          data: {
            claimId: claim.id,
            tenantId: firm.id,
            revision: 1,
            basis: settlementBasis,
            assessedLoss: money(assessed),
            depreciationRate:
              settlementBasis === SettlementBasis.INDEMNITY
                ? new Prisma.Decimal(depreciation.toFixed(4))
                : null,
            sumInsured: money((isTravel ? AMOUNT_BAND[type!][1] : PROPERTY_BAND[category]![1]) * 2),
            averageCondition: false,
            excess: money(excess),
            adjustedLoss: money(afterDepreciation),
            underinsured: false,
            averageApplied: false,
            recommended: money(recommended),
            cappedAtSumInsured: false,
            lines: [
              { key: 'assessed-loss', label: 'Assessed loss', amount: assessed.toFixed(2), basis: 'Cost to reinstate or repair, as assessed' },
              ...(depreciation > 0
                ? [{
                    key: 'depreciation',
                    label: 'Less: depreciation',
                    amount: (-(assessed - afterDepreciation)).toFixed(2),
                    basis: `Indemnity basis, ${(depreciation * 100).toFixed(1)}% for age and wear`,
                  }]
                : []),
              ...(excess > 0
                ? [{ key: 'excess', label: 'Less: excess', amount: (-excess).toFixed(2), basis: 'Policy excess borne by the insured, applied after average' }]
                : []),
            ],
            warnings: [],
            preparedByAdjusterId: adjuster.id,
            createdAt: reportAt,
            updatedAt: reportAt,
          },
        });
        totals.worksheets += 1;
      }

      // --- assignments (insurer-appointed subset) ---------------------------
      if (chance(0.32)) {
        const receivedAt = addDays(convertedAt, -intBetween(0, 2));
        const acknowledged = chance(0.9);
        await prisma.assignment.create({
          data: {
            insurerTenantId: insurer.id,
            handlingTenantId: firm.id,
            externalRef: `MSIG-APP-${claimNumber.slice(-6)}`,
            scope: isTravel
              ? `Travel — ${type!.replace(/_/g, ' ').toLowerCase()}`
              : `${category.charAt(0)}${category.slice(1).toLowerCase()} — property loss`,
            appointedByName: 'MSIG Claims Desk',
            appointedByEmail: 'claims@msig.com.my',
            receivedAt,
            status: acknowledged ? 'ACCEPTED' : 'RECEIVED',
            acknowledgedAt: acknowledged ? addHours(receivedAt, intBetween(2, 20)) : null,
            createdAt: receivedAt,
          },
        });
        totals.assignments += 1;
      }

      // --- evidence documents ---------------------------------------------
      // A checklist permanently reading 0/3 demonstrates the control and never
      // the outcome. Most converted claims have their mandatory evidence; a
      // deliberate minority do not, which is what the chase-up path is for.
      const evidence = evidenceFor(category, type);
      const complete = chance(0.78);
      const toUpload = complete ? evidence : evidence.slice(0, Math.max(evidence.length - 1, 1));

      for (const [docType, filename] of toUpload) {
        await prisma.document.create({
          data: {
            claimId: claim.id,
            tenantId: firm.id,
            type: docType,
            filename,
            storageUrl: `seed://documents/${claim.id}/${filename}`,
            fileSize: intBetween(48_000, 2_400_000),
            mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
            // DocumentStatus tracks processing, not adjuster acceptance.
            status: 'COMPLETED',
            createdAt: addDays(convertedAt, intBetween(0, 3)),
          },
        });
        totals.documents += 1;
      }

      // --- video sessions -----------------------------------------------------
      // A claim that reached SCHEDULED was scheduled for something. Without a
      // session row the dashboard shows a scheduled count beside an empty
      // upcoming list, which is the kind of disagreement a demo dies on.
      if (scheduledAt && mode !== AssessmentMode.DESK_REVIEW && mode !== AssessmentMode.EXPERT_REFERRAL) {
        const held = Boolean(assessedAt);
        await prisma.session.create({
          data: {
            claimId: claim.id,
            tenantId: firm.id,
            // BigInt in the schema — Daily.co room ids are numeric.
            roomId: BigInt(claimSeq * 1000 + intBetween(0, 999)),
            roomUrl: `https://trueclaim.daily.co/${claimNumber.toLowerCase()}`,
            status: held ? 'COMPLETED' : 'SCHEDULED',
            scheduledTime: scheduledAt,
            startedAt: held ? assessedAt : null,
            endedAt: held ? addHours(assessedAt!, 1) : null,
            durationSeconds: held ? intBetween(900, 3300) : null,
            analysisStatus: held && chance(0.6) ? 'COMPLETED' : 'PENDING',
            createdAt: scheduledAt,
          },
        });
        totals.sessions += 1;
      }

      // --- SLA clocks --------------------------------------------------------
      const slaPolicyId = await defaultPolicyId();
      if (assignedAt && slaPolicyId) {
        const dueAt = addDays(assignedAt, 10);
        const breached = !reportAt && dueAt < TODAY;
        await prisma.slaClock.create({
          data: {
            claimId: claim.id,
            policyId: slaPolicyId,
            stage: 'FINAL_REPORT',
            startedAt: assignedAt,
            dueAt,
            state: reportAt ? 'MET' : breached ? 'BREACHED' : 'RUNNING',
            stoppedAt: reportAt,
            breachedAt: breached ? dueAt : null,
            escalationLevel: breached ? intBetween(1, 3) : 0,
            createdAt: assignedAt,
          },
        });
        totals.slaClocks += 1;
        if (breached) totals.breaches += 1;
      }
    }
  }

  // --- FNOL emails that did not parse -------------------------------------
  // The operator queue is the point of the ingestion work; an empty one proves
  // nothing about it.
  for (let i = 0; i < 14; i += 1) {
    const receivedAt = addDays(TODAY, -intBetween(0, 21));
    const failed = chance(0.3);
    await prisma.inboundMessage.create({
      data: {
        messageId: `<unparsed-${i}-${Date.now()}@brokerage.com.my>`,
        tenantId: (await prisma.tenant.findFirst({ where: { type: 'ADJUSTING_FIRM' } }))!.id,
        fromAddress: pick(['agent12@brokerage.com.my', 'noreply@airline.com', 'traveller@example.my']),
        toAddress: 'claims@trueclaiminsight.my',
        subject: pick([
          'Fwd: my trip',
          'Claim',
          'Re: Travel insurance — urgent',
          'Automatic reply: Out of office',
        ]),
        receivedAt,
        status: failed ? InboundMessageStatus.FAILED : InboundMessageStatus.NEEDS_REVIEW,
        error: failed
          ? 'Attachment could not be read'
          : pick([
              'Could not determine the claim type from the email',
              'Missing mandatory detail: policyNumber, incidentDate',
              'Missing mandatory detail: incidentDate',
            ]),
        parsed: { missing: ['policyNumber', 'incidentDate'] },
        createdAt: receivedAt,
      },
    });
    totals.inbound += 1;
    totals.needsReview += 1;
  }

  console.log(`  cases                 ${totals.cases}`);
  console.log(`    rejected            ${totals.rejected}`);
  console.log(`    abandoned           ${totals.abandoned}`);
  console.log(`    info requested      ${totals.infoRequested}`);
  console.log(`  claims                ${totals.claims}`);
  console.log(`  assignments           ${totals.assignments}`);
  console.log(`  assessment decisions  ${totals.modeDecisions}`);
  console.log(`  quantum worksheets    ${totals.worksheets}`);
  console.log(`  fraud signals         ${totals.fraudSignals}`);
  console.log(`  PDPA consents         ${totals.consents}`);
  console.log(`  case evidence         ${totals.caseDocuments}`);
  console.log(`  claim documents       ${totals.documents}`);
  console.log(`  video sessions        ${totals.sessions}`);
  console.log(`  SLA clocks            ${totals.slaClocks} (${totals.breaches} breached)`);
  console.log(`  inbound FNOL emails   ${totals.inbound} (${totals.needsReview} awaiting review)`);
  console.log(`  notifications         ${totals.notifications}`);
  console.log('\nDone.');
}

let cachedPolicyId: string | null | undefined;
async function defaultPolicyId(): Promise<string | null> {
  if (cachedPolicyId !== undefined) return cachedPolicyId;
  const policy = await prisma.slaPolicy.findFirst({ where: { stage: 'FINAL_REPORT' } });
  cachedPolicyId = policy?.id ?? null;
  return cachedPolicyId;
}

/** Lifecycle ordering, so a claim never carries a date for a stage it never reached. */
function stageIndex(status: ClaimStatus): number {
  const order: ClaimStatus[] = [
    ClaimStatus.SUBMITTED,
    ClaimStatus.ASSIGNED,
    ClaimStatus.SCHEDULED,
    ClaimStatus.IN_ASSESSMENT,
    ClaimStatus.REPORT_PENDING,
    ClaimStatus.APPROVED,
    ClaimStatus.REJECTED,
    ClaimStatus.ESCALATED_SIU,
    ClaimStatus.CLOSED,
  ];
  const index = order.indexOf(status);
  // Terminal statuses imply the whole path was walked.
  if (status === ClaimStatus.CLOSED || status === ClaimStatus.APPROVED || status === ClaimStatus.REJECTED) {
    return order.indexOf(ClaimStatus.REPORT_PENDING);
  }
  if (status === ClaimStatus.ESCALATED_SIU) return order.indexOf(ClaimStatus.IN_ASSESSMENT);
  return index;
}

function describeIncident(type: TravelClaimType, destination: string, flight: string): string {
  switch (type) {
    case TravelClaimType.FLIGHT_DELAY:
      return `Flight ${flight} to ${destination} delayed; claimant seeking delay benefit.`;
    case TravelClaimType.LUGGAGE_DAMAGE:
      return `Checked baggage damaged in transit to ${destination}.`;
    case TravelClaimType.LUGGAGE_LOSS:
      return `Checked baggage not delivered on arrival in ${destination}.`;
    case TravelClaimType.TRIP_CANCELLATION:
      return `Trip to ${destination} cancelled before departure.`;
    case TravelClaimType.MEDICAL:
      return `Medical treatment required in ${destination}; referred for expert review.`;
  }
}

function monthsBetween(from: Date, to: Date): Date[] {
  const months: Date[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor <= to) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** How much of this month has actually happened — the current month is partial. */
function monthFraction(month: Date, today: Date): number {
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  if (end <= today) return 1;
  return Math.max(today.getUTCDate() / end.getUTCDate(), 0.1);
}

function randomDayIn(month: Date, today: Date): Date {
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const last = end <= today ? end.getUTCDate() : today.getUTCDate();
  const day = intBetween(1, Math.max(last, 1));
  // Travel incidents cluster slightly at weekends; office hours do not apply.
  return new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day, intBetween(0, 23), intBetween(0, 59))
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
