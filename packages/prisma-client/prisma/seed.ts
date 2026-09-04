import {
  PrismaClient,
  UserRole,
  TenantType,
  ClaimType,
  ClaimStatus,
  ClaimCategory,
  TravelClaimType,
  DocumentType,
  PolicySource,
  FlowStatus,
  FeeBasis,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CSP_ADJUSTING_WORKING_DAYS, CSP_SUPPLEMENTARY_WORKING_DAYS } from '@tci/shared-types';
import {
  CASE_FLOWS,
  TRAVEL_CLAIM_TYPE_LABELS,
  validateFlowDefinition,
  type CaseFlow,
} from '@tci/shared-types';
import { EncryptionService, EnvKeyProvider } from '@tci/crypto';
import { PrismaKeyStore } from '../src/key-store';

/**
 * Encryption for seeded personal data, using the same key custody as the
 * services: master key from ENCRYPTION_MASTER_KEY, data keys wrapped in
 * `encryption_keys`. The seed therefore also bootstraps key v1 on a fresh
 * database, so the first service to boot adopts the existing key rather than
 * racing to create one.
 */
async function buildEncryption(prisma: PrismaClient) {
  const configLike = { get: (key: string) => process.env[key] } as never;
  const service = new EncryptionService(new PrismaKeyStore(prisma), new EnvKeyProvider(configLike));
  await service.onModuleInit();
  return service;
}

const MALAYSIA_CARS: Record<string, string[]> = {
  Perodua: ['Myvi', 'Axia', 'Bezza', 'Alza', 'Aruz', 'Ativa', 'Traz'],
  Proton: ['Saga', 'Persona', 'Iriz', 'Exora', 'X50', 'X70', 'X90', 'S70', 'e.MAS 7'],
  Honda: ['City', 'Civic', 'HR-V', 'CR-V', 'Jazz', 'City Hatchback', 'WR-V', 'Accord'],
  Toyota: [
    'Vios',
    'Yaris',
    'Corolla Cross',
    'Hilux',
    'Veloz',
    'Camry',
    'Innova',
    'Fortuner',
    'Alphard',
    'Vellfire',
  ],
  Mazda: ['2', '3', '6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-8', 'CX-90', 'BT-50', 'MX-5'],
  Nissan: ['Almera', 'Serena', 'X-Trail', 'Navara', 'Kicks e-Power', 'Leaf'],
  BMW: [
    '1 Series',
    '2 Series',
    '3 Series',
    '5 Series',
    '7 Series',
    'X1',
    'X3',
    'X5',
    'X7',
    'iX1',
    'iX3',
    'iX',
    'i4',
    'i5',
    'i7',
  ],
  'Mercedes-Benz': [
    'A-Class',
    'C-Class',
    'E-Class',
    'S-Class',
    'GLA',
    'GLB',
    'GLC',
    'GLE',
    'GLS',
    'EQA',
    'EQB',
    'EQE',
    'EQS',
  ],
  BYD: ['Atto 3', 'Dolphin', 'Seal', 'Seal U DM-i', 'Sealion 6', 'M6'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X'],
  Kia: ['Picanto', 'Seltos', 'Sportage', 'Sorento', 'Carnival', 'EV6', 'EV9'],
  Hyundai: ['Stargazer', 'Creta', 'Tucson', 'Santa Fe', 'Staria', 'Ioniq 5', 'Ioniq 6'],
  Chery: ['Omoda 5', 'Omoda E5', 'Tiggo 7 Pro', 'Tiggo 8 Pro'],
  ORA: ['Good Cat', 'Good Cat GT'],
  Audi: ['A3', 'A4', 'A6', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'e-tron', 'Q4 e-tron'],
  Volkswagen: ['Polo', 'Vento', 'Passat', 'Tiguan', 'ID.4'],
  Mitsubishi: ['Attrage', 'ASX', 'Outlander', 'Triton', 'Xpander'],
  Subaru: ['XV', 'Forester', 'Outback', 'WRX', 'BRZ'],
  Peugeot: ['2008', '3008', '5008', 'e-2008'],
  Renault: ['Captur', 'Koleos', 'Triber'],
  MG: ['MG5', 'MG ZS', 'MG HS', 'MG4 EV', 'MG ZS EV', 'Cyberster'],
  GWM: ['Ora Good Cat', 'Haval H6', 'Haval Jolion', 'Haval H6 HEV'],
  Neta: ['V', 'X', 'S'],
  Zeekr: ['X', '001', '009'],
  Aion: ['Y Plus', 'ES', 'V'],
  Lynk: ['01', '05', '06', '09'],
  Smart: ['#1', '#3'],
  Volvo: ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'C40 Recharge', 'XC40 Recharge'],
  Porsche: ['Macan', 'Cayenne', 'Panamera', 'Taycan', '911', '718'],
  'Land Rover': [
    'Defender',
    'Discovery',
    'Discovery Sport',
    'Range Rover Evoque',
    'Range Rover Velar',
    'Range Rover Sport',
    'Range Rover',
  ],
  Lexus: ['UX', 'NX', 'RX', 'ES', 'IS', 'LS', 'LM', 'UX 300e'],
  Ferrari: [
    'Roma',
    'Portofino',
    'F8 Tributo',
    '296 GTB',
    'SF90 Stradale',
    '812 Superfast',
    'Purosangue',
  ],
  Lamborghini: ['Huracán', 'Urus', 'Revuelto'],
  'Rolls-Royce': ['Ghost', 'Phantom', 'Cullinan', 'Spectre'],
  Bentley: ['Continental GT', 'Flying Spur', 'Bentayga'],
  Maserati: ['Ghibli', 'Quattroporte', 'Levante', 'MC20', 'GranTurismo', 'Grecale'],
  'Aston Martin': ['DB12', 'DBX', 'Vantage', 'DBS'],
  McLaren: ['GT', 'Artura', '720S', '765LT', '750S'],
};

const prisma = new PrismaClient();

/** `FLIGHT_DELAY` → `travel-flight-delay`. Stable across versions. */
const flowKey = (travelClaimType: string) =>
  `travel-${travelClaimType.toLowerCase().replace(/_/g, '-')}`;

/**
 * Publish the built-in travel flows as platform-default FlowDefinition rows.
 *
 * These are the same five flows `CASE_FLOWS` has always held, moved from code
 * into data so a flow can be versioned, overlaid per channel and locale, and
 * eventually edited without a deploy. Seeding them as `tenantId: null` makes
 * them available to every tenant; a tenant that later needs its own wording
 * adds an overlay, and one that needs its own structure gets its own row that
 * shadows the default.
 *
 * Each flow goes through the publish gate first. A seed that writes a broken
 * flow is worse than one that fails: it produces a conversation that dead-ends
 * in production, and nothing about a stalled Case says which flow did it.
 */
async function seedFlowDefinitions(createdByUserId: string) {
  let published = 0;

  for (const [travelClaimType, flow] of Object.entries(CASE_FLOWS) as Array<
    [string, CaseFlow]
  >) {
    // Passing the flow as its own reference is not a tautology: it checks that
    // every step marked `system: true` is actually reachable from the entry,
    // which a miswired branch can break.
    const problems = validateFlowDefinition(flow, flow);
    if (problems.length > 0) {
      throw new Error(
        `Flow ${travelClaimType} failed the publish gate:\n` +
          problems.map(problem => `  - [${problem.kind}] ${problem.detail}`).join('\n')
      );
    }

    const key = flowKey(travelClaimType);
    const existing = await prisma.flowDefinition.findFirst({
      where: { tenantId: null, key, version: 1 },
    });

    const payload = {
      name: TRAVEL_CLAIM_TYPE_LABELS[travelClaimType as keyof typeof TRAVEL_CLAIM_TYPE_LABELS],
      category: ClaimCategory.TRAVEL,
      travelClaimType: travelClaimType as TravelClaimType,
      entryStepId: flow.entryStepId,
      steps: flow.steps as unknown as object,
      status: FlowStatus.PUBLISHED,
      publishedByUserId: createdByUserId,
      publishedAt: new Date(),
    };

    if (existing) {
      // Re-running the seed refreshes the built-ins in place. Safe because
      // version 1 is ours; an author's edits live on a new version, which this
      // never touches.
      await prisma.flowDefinition.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.flowDefinition.create({
        data: { ...payload, tenantId: null, key, version: 1, createdByUserId },
      });
      published += 1;
    }
  }

  console.log(
    `🧭 Intake flows: ${Object.keys(CASE_FLOWS).length} published as platform defaults` +
      ` (${published} new).`
  );
}

async function main() {
  console.log('🌱 Seeding database with demo data...');

  const password = 'DemoPass123!';
  const hashedPassword = await bcrypt.hash(password, 12);
  const encryption = await buildEncryption(prisma);

  // 1. Create Tenants
  const ALLIANZ_ID = 'd601d36d-2d41-471b-9d41-325091726a57';
  const PACIFIC_ID = '87a93415-373b-4835-9616-832f05786720';

  const insurerTenant = await prisma.tenant.upsert({
    where: { id: ALLIANZ_ID },
    update: {},
    create: {
      id: ALLIANZ_ID,
      name: 'Allianz Insurance Malaysia',
      type: TenantType.INSURER,
      settings: {},
    },
  });

  const adjusterTenant = await prisma.tenant.upsert({
    where: { id: PACIFIC_ID },
    update: {},
    create: {
      id: PACIFIC_ID,
      name: 'Pacific Adjusters Sdn Bhd',
      type: TenantType.ADJUSTING_FIRM,
      settings: {},
    },
  });

  console.log('🏢 Tenants created.');

  // 2. Helper for creating users
  const upsertUser = async (
    email: string,
    fullName: string,
    role: UserRole,
    phoneNumber: string,
    tenantId: string | null = null
  ) => {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword,
        currentTenantId: tenantId || undefined,
      },
      create: {
        email,
        password: hashedPassword,
        fullName,
        phoneNumber,
        role,
        tenantId,
        currentTenantId: tenantId,
        isVerified: true,
      },
    });

    if (tenantId) {
      await prisma.userTenant.upsert({
        where: {
          userId_tenantId: {
            userId: user.id,
            tenantId: tenantId,
          },
        },
        update: {
          role: role,
          status: 'ACTIVE',
        },
        create: {
          userId: user.id,
          tenantId: tenantId,
          role: role,
          isDefault: true,
          status: 'ACTIVE',
        },
      });
    }

    return user;
  };

  // 3. Create 8 Demo Users
  const superAdmin = await upsertUser(
    'superadmin@tci.com',
    'System Super Admin',
    UserRole.SUPER_ADMIN,
    '+60100000000'
  );

  const firmAdmin = await upsertUser(
    'admin@pacific.com',
    'Pacific Admin',
    UserRole.FIRM_ADMIN,
    '+60100000001',
    adjusterTenant.id
  );

  const adjusterUser = await upsertUser(
    'adjuster@pacific.com',
    'Ahmad Adjuster',
    UserRole.ADJUSTER,
    '+60100000002',
    adjusterTenant.id
  );
  const adjusterUserAllianz = await upsertUser(
    'adjuster@pacific.com',
    'Ahmad Adjuster',
    UserRole.ADJUSTER,
    '+60100000002',
    insurerTenant.id
  );

  const firmAdminAllianz = await upsertUser(
    'admin@allianz.com',
    'Allianz Admin',
    UserRole.FIRM_ADMIN,
    '+60100000003',
    insurerTenant.id
  );
  const siuInvestigator = await upsertUser(
    'siu@allianz.com',
    'Zul SIU',
    UserRole.SIU_INVESTIGATOR,
    '+60100000004',
    insurerTenant.id
  );
  const compliance = await upsertUser(
    'compliance@allianz.com',
    'Mei Compliance',
    UserRole.COMPLIANCE_OFFICER,
    '+60100000005',
    insurerTenant.id
  );
  const support = await upsertUser(
    'support@allianz.com',
    'Support Team',
    UserRole.SUPPORT_DESK,
    '+60100000006',
    insurerTenant.id
  );
  const shariah = await upsertUser(
    'shariah@allianz.com',
    'Ustaz Shariah',
    UserRole.SHARIAH_REVIEWER,
    '+60100000007',
    insurerTenant.id
  );

  // Claimant is separate identity table
  const claimant = await prisma.claimant.upsert({
    where: { phoneNumber: '+60123456789' },
    update: {},
    create: {
      id: 'a3f67ba7-d335-4d52-95cc-63e5a14c1014',
      phoneNumber: '+60123456789',
      fullName: 'Kumar Claimant',
      kycStatus: 'VERIFIED',
    },
  });

  console.log('👤 Users created.');

  // 4. Create Adjuster Profile (linked to User)
  const adjusterProfile = await prisma.adjuster.upsert({
    where: { userId: adjusterUser.id },
    update: {},
    create: {
      userId: adjusterUser.id,
      tenantId: adjusterTenant.id,
      licenseNumber: 'AJ-MAL-999',
      bcillaCertified: true,
      amlaMember: true,
      status: 'ACTIVE',
    },
  });

  console.log('📋 Adjuster profile linked.');

  // 5. Create Sample Claim
  await prisma.claim.upsert({
    where: { claimNumber: 'CLM-2025-000001' },
    update: {
      tenantId: insurerTenant.id,
      userId: firmAdmin.id,
    } as any,
    create: {
      claimNumber: 'CLM-2025-000001',
      claimantId: claimant.id,
      adjusterId: adjusterProfile.id,
      insurerTenantId: insurerTenant.id,
      tenantId: insurerTenant.id,
      userId: firmAdmin.id,
      policyNumber: 'POL-667788',
      claimType: ClaimType.OWN_DAMAGE,
      status: ClaimStatus.ASSIGNED,
      incidentDate: new Date('2025-12-10'),
      description: 'Vehicle collision at highway exit.',
      incidentLocation: { address: 'NKVE Subang Exit, Selangor' },
      vehiclePlateNumber: 'VAB 1234',
      vehicleMake: 'Proton',
      vehicleModel: 'X50',
      isPdpaCompliant: true,
      complianceNotes: { initialAudit: 'Completed', timestamp: new Date().toISOString() },
    } as any,
  } as any);

  console.log('🚗 Sample claim created.');

  // 6. Run Vehicle Seed
  console.log('🚙 Seeding vehicle master data...');

  for (const [makeName, models] of Object.entries(MALAYSIA_CARS)) {
    const make = await prisma.vehicleMake.upsert({
      where: {
        tenantId_name: {
          tenantId: PACIFIC_ID,
          name: makeName,
        },
      } as any,
      update: { tenantId: PACIFIC_ID },
      create: {
        name: makeName,
        tenantId: PACIFIC_ID,
      },
    });

    for (const modelName of models) {
      await prisma.vehicleModel.upsert({
        where: {
          tenantId_makeId_name: {
            tenantId: PACIFIC_ID,
            makeId: make.id,
            name: modelName,
          },
        } as any,
        update: { tenantId: PACIFIC_ID },
        create: {
          name: modelName,
          makeId: make.id,
          tenantId: PACIFIC_ID,
        },
      });
    }
  }

  // 7. TPA setup — MSIG insurer tenant + sample travel policies (MANUAL source,
  // mirroring policy data keyed in from MSIG emails until API/scraper adapters ship)
  const MSIG_ID = '5b1f6f3e-9d2a-4f7c-8a3b-1c9e7d5a2b40';
  const msigTenant = await prisma.tenant.upsert({
    where: { id: MSIG_ID },
    update: {},
    create: {
      id: MSIG_ID,
      name: 'MSIG Insurance (Malaysia) Bhd',
      type: TenantType.INSURER,
      settings: {},
    },
  });

  // Insured NRICs go in encrypted, exactly as the application writes them, so
  // demo data has the same shape as production and nobody is tempted to
  // reintroduce a plaintext column to make the seed work.
  const samplePolicies = [
    {
      policyNumber: 'MSIG-TRV-2026-0001',
      insuredName: 'Kumar Claimant',
      insuredNric: '880101-14-5555',
      insuredPhone: '+60123456789',
      planTier: 'TravelRight Plus Gold',
      tripStartDate: new Date('2026-07-20'),
      tripEndDate: new Date('2026-08-05'),
      destination: 'Japan',
    },
    {
      policyNumber: 'MSIG-TRV-2026-0002',
      insuredName: 'Siti Aminah binti Rahman',
      insuredNric: '920315-10-2244',
      insuredPhone: '+60198765432',
      planTier: 'TravelRight Plus Silver',
      tripStartDate: new Date('2026-08-01'),
      tripEndDate: new Date('2026-08-10'),
      destination: 'United Kingdom',
    },
    {
      policyNumber: 'MSIG-TRV-2026-0003',
      insuredName: 'Tan Wei Ming',
      insuredPhone: '+60171112222',
      planTier: 'TravelRight Plus Platinum',
      tripStartDate: new Date('2026-07-25'),
      tripEndDate: new Date('2026-09-01'),
      destination: 'Australia',
    },
  ];

  for (const { insuredNric, ...policy } of samplePolicies) {
    const encrypted = insuredNric
      ? {
          insuredNricEncrypted: await encryption.encrypt(insuredNric),
          insuredNricLast4: encryption.lastDigits(insuredNric),
        }
      : {};

    await prisma.policy.upsert({
      where: {
        tenantId_policyNumber: { tenantId: msigTenant.id, policyNumber: policy.policyNumber },
      },
      update: encrypted,
      create: {
        ...policy,
        ...encrypted,
        tenantId: msigTenant.id,
        source: PolicySource.MANUAL,
        coverageSnapshot: { currency: 'MYR', asSuppliedBy: 'MSIG email' },
      },
    });
  }

  console.log('🏢 MSIG tenant + sample travel policies created.');

  // Illustrative SCALE from the CSP fee arithmetic tests — not any insurer's
  // real terms. Without a row, drafting a fee note refuses: rates are tenant
  // configuration. Pacific is included because a chat case converted without a
  // linked policy bills the handling firm as insurerTenantId.
  const demoFeeBands = [
    { upTo: 10_000, pct: 0.1 },
    { upTo: 50_000, pct: 0.05 },
    { upTo: null, pct: 0.02 },
  ];
  for (const tenantId of [PACIFIC_ID, ALLIANZ_ID, msigTenant.id]) {
    const existingScale = await prisma.feeScale.findFirst({
      where: { tenantId, isActive: true },
    });
    if (existingScale) continue;
    await prisma.feeScale.create({
      data: {
        tenantId,
        basis: FeeBasis.SCALE,
        bands: demoFeeBands,
        sstRate: 0.08,
        paymentTermsDays: 30,
        isActive: true,
      },
    });
  }
  console.log('💷 Demo fee scales seeded (SCALE, 8% SST) for Pacific, Allianz and MSIG.');

  // 8. Travel evidence requirements — global defaults (tenantId null), one
  // checklist per travel claim subtype. Upsert-by-delete because the compound
  // unique key contains nullable tenantId, which Prisma upsert cannot target.
  const travelEvidence: Array<{
    travelClaimType: TravelClaimType;
    documentType: DocumentType;
    isMandatory: boolean;
    description: string;
  }> = [
    // Flight delay
    { travelClaimType: TravelClaimType.FLIGHT_DELAY, documentType: DocumentType.AIRLINE_DELAY_CONFIRMATION, isMandatory: true, description: 'Airline letter or notice confirming the delay or cancellation' },
    { travelClaimType: TravelClaimType.FLIGHT_DELAY, documentType: DocumentType.BOARDING_PASS, isMandatory: true, description: 'Boarding pass for the delayed flight' },
    { travelClaimType: TravelClaimType.FLIGHT_DELAY, documentType: DocumentType.FLIGHT_ITINERARY, isMandatory: true, description: 'E-ticket or booking confirmation' },
    // Luggage damage
    { travelClaimType: TravelClaimType.LUGGAGE_DAMAGE, documentType: DocumentType.PROPERTY_IRREGULARITY_REPORT, isMandatory: true, description: 'Property Irregularity Report (PIR) issued by the airline' },
    { travelClaimType: TravelClaimType.LUGGAGE_DAMAGE, documentType: DocumentType.BAGGAGE_TAG, isMandatory: true, description: 'Baggage tag for the affected luggage' },
    { travelClaimType: TravelClaimType.LUGGAGE_DAMAGE, documentType: DocumentType.DAMAGE_PHOTO, isMandatory: true, description: 'Photographs of the damaged luggage' },
    { travelClaimType: TravelClaimType.LUGGAGE_DAMAGE, documentType: DocumentType.PROOF_OF_OWNERSHIP, isMandatory: false, description: 'Receipts or proof of purchase for the luggage' },
    // Luggage loss
    { travelClaimType: TravelClaimType.LUGGAGE_LOSS, documentType: DocumentType.PROPERTY_IRREGULARITY_REPORT, isMandatory: true, description: 'Property Irregularity Report (PIR) issued by the airline' },
    { travelClaimType: TravelClaimType.LUGGAGE_LOSS, documentType: DocumentType.BAGGAGE_TAG, isMandatory: true, description: 'Baggage tag for the lost luggage' },
    { travelClaimType: TravelClaimType.LUGGAGE_LOSS, documentType: DocumentType.PROOF_OF_OWNERSHIP, isMandatory: true, description: 'Receipts or proof of ownership for the contents claimed' },
    // Trip cancellation
    { travelClaimType: TravelClaimType.TRIP_CANCELLATION, documentType: DocumentType.TRAVEL_BOOKING_INVOICE, isMandatory: true, description: 'Booking invoices and any cancellation or refund correspondence' },
    { travelClaimType: TravelClaimType.TRIP_CANCELLATION, documentType: DocumentType.FLIGHT_ITINERARY, isMandatory: true, description: 'E-ticket or booking confirmation for the cancelled trip' },
    // Reason evidence: not mandatory, because these rows are flat per subtype
    // and only one of them applies to any given claim. Which one the claimant
    // was actually asked for is decided by `cancellation-reason` in the flow.
    { travelClaimType: TravelClaimType.TRIP_CANCELLATION, documentType: DocumentType.MEDICAL_REPORT, isMandatory: false, description: 'Medical report where cancellation is due to illness' },
    { travelClaimType: TravelClaimType.TRIP_CANCELLATION, documentType: DocumentType.DEATH_CERTIFICATE, isMandatory: false, description: 'Death certificate (Sijil Kematian) where cancellation is due to a death in the family' },
    { travelClaimType: TravelClaimType.TRIP_CANCELLATION, documentType: DocumentType.BURIAL_PERMIT, isMandatory: false, description: 'Burial permit — interim proof accepted before JPN issues the death certificate; the certificate is still outstanding' },
    { travelClaimType: TravelClaimType.TRIP_CANCELLATION, documentType: DocumentType.PROOF_OF_RELATIONSHIP, isMandatory: false, description: 'Birth or marriage certificate linking the claimant to the deceased' },
    // Medical (form + expert routing — never auto-assessed)
    { travelClaimType: TravelClaimType.MEDICAL, documentType: DocumentType.OVERSEAS_MEDICAL_BILL, isMandatory: true, description: 'Itemised overseas medical bills and receipts' },
    { travelClaimType: TravelClaimType.MEDICAL, documentType: DocumentType.MEDICAL_REPORT, isMandatory: true, description: 'Medical report or discharge summary from the treating hospital' },
    { travelClaimType: TravelClaimType.MEDICAL, documentType: DocumentType.PASSPORT, isMandatory: true, description: 'Passport pages showing identity and travel dates' },
  ];

  await prisma.evidenceRequirement.deleteMany({
    where: { tenantId: null, category: ClaimCategory.TRAVEL },
  });
  await prisma.evidenceRequirement.createMany({
    data: travelEvidence.map((req, index) => ({
      tenantId: null,
      category: ClaimCategory.TRAVEL,
      travelClaimType: req.travelClaimType,
      documentType: req.documentType,
      isMandatory: req.isMandatory,
      description: req.description,
      sortOrder: index,
    })),
  });

  console.log('🧳 Travel evidence requirements seeded.');

  // Platform-default SLA policies — the BNM CSP timelines. A panel insurer that
  // negotiates different targets gets its own row with a tenantId, which
  // overrides these without a code change.
  //
  // `monitorOnly` marks the insurer's own obligations: the firm measures them so
  // it can evidence where a delay originated, but a breach there is not the
  // firm's failing and must never escalate against it.
  // calendarState drives both the weekend pattern and which state holidays
  // apply. The firm operates from Kuala Lumpur; a panel insurer in a
  // Friday–Saturday state would get its own policy rows.
  const slaPolicies = [
    { stage: 'ACK_TO_INSURER' as const, workingDays: 1, warnWorkingDaysBefore: 1 },
    { stage: 'PRELIMINARY_REPORT' as const, workingDays: 7, warnWorkingDaysBefore: 2 },
    // CSP para 10.13: 14 working days for non-motor, from receipt of complete
    // documents. This book is non-motor (MASTER_PLAN §1) — motor's 10 is not a
    // second row because the platform does not serve that line.
    {
      stage: 'FINAL_REPORT' as const,
      workingDays: CSP_ADJUSTING_WORKING_DAYS.NON_MOTOR,
      warnWorkingDaysBefore: 2,
    },
    { stage: 'SUPPLEMENTARY_CLAIM' as const, workingDays: CSP_SUPPLEMENTARY_WORKING_DAYS, warnWorkingDaysBefore: 1 },
    { stage: 'INSURER_DECISION' as const, workingDays: 7, warnWorkingDaysBefore: 2, monitorOnly: true },
    { stage: 'INSURER_PAYMENT' as const, workingDays: 14, warnWorkingDaysBefore: 3, monitorOnly: true },
  ];

  for (const policy of slaPolicies) {
    const existing = await prisma.slaPolicy.findFirst({
      where: { tenantId: null, stage: policy.stage },
    });
    const withCalendar = { ...policy, calendarState: 'KUALA_LUMPUR' };
    if (existing) {
      await prisma.slaPolicy.update({ where: { id: existing.id }, data: withCalendar });
    } else {
      await prisma.slaPolicy.create({ data: withCalendar });
    }
  }

  console.log('⏱️  SLA policies seeded (CSP defaults, Kuala Lumpur calendar).');

  // The demo firm's operating decisions (MASTER_PLAN §2.4).
  //
  // These were described in the plan as "configured in the seed" and were not:
  // every tenant was created with `settings: {}`, which is *absent*, and absent
  // is refusal by design everywhere it is read. So the fast track never fired,
  // no opening decision ever chose a site visit, and the one reminder on a
  // returned case never sent — three documented behaviours that could not be
  // exercised in any seeded environment, including the demo. The fast-track SLA
  // row seeded just below was unreachable for the same reason: it resolves only
  // for a claim that took the fast track.
  //
  // Written as an explicit update rather than in the tenant upsert's `create`,
  // because an existing database would otherwise keep its empty settings.
  // Business decisions, not platform defaults — an insurer panel gets its own.
  await prisma.tenant.update({
    where: { id: adjusterTenant.id },
    data: {
      settings: {
        // Travel is the live line, desk-reviewed up to RM5,000.
        fastTrackCategories: ['TRAVEL'],
        fastTrackLimits: { TRAVEL: '5000.00' },
        // Property lines the firm attends in person at or above RM20,000 —
        // essentially every fire, the larger floods and burglaries, while small
        // contents losses stay on video. Travel is absent: the loss happened
        // overseas and has no risk address to attend.
        siteVisitCategories: ['FIRE', 'FLOOD', 'BURGLARY', 'LIGHTNING', 'HOH'],
        siteVisitThresholds: {
          FIRE: '20000.00',
          FLOOD: '20000.00',
          BURGLARY: '20000.00',
          LIGHTNING: '20000.00',
          HOH: '20000.00',
        },
        // One reminder after three working days of silence on a returned case.
        infoRequestReminderDays: 3,
      },
    },
  });

  console.log(
    '🏷️  Demo firm settings seeded (travel fast track RM5,000, site visit RM20,000, 3-day reminder).'
  );

  // The demo firm's fast-track promise: 3 working days to the final report on
  // claims that took the §2.4 fast track — the worked example from the plan.
  // A business decision recorded in the seed, deliberately not a platform
  // default: a shorter turnaround is a commercial commitment per insurer, so
  // resolvePolicy only ever honours a tenant's own fastTrack row.
  const fastTrackPolicy = {
    tenantId: adjusterTenant.id,
    stage: 'FINAL_REPORT' as const,
    workingDays: 3,
    warnWorkingDaysBefore: 1,
    calendarState: 'KUALA_LUMPUR',
    fastTrack: true,
  };
  const existingFastTrack = await prisma.slaPolicy.findFirst({
    where: { tenantId: adjusterTenant.id, stage: 'FINAL_REPORT', fastTrack: true },
  });
  if (existingFastTrack) {
    await prisma.slaPolicy.update({ where: { id: existingFastTrack.id }, data: fastTrackPolicy });
  } else {
    await prisma.slaPolicy.create({ data: fastTrackPolicy });
  }

  console.log('⚡ Fast-track SLA profile seeded for the demo firm (final report: 3 working days).');

  // Approval authority (§4.3 A3). ADJUSTER is deliberately absent: an adjuster
  // assesses and recommends, and does not decide the outcome of their own work.
  // An absent row means no authority, not unlimited authority.
  for (const tenantId of [adjusterTenant.id, insurerTenant.id]) {
    for (const limit of [
      { role: UserRole.FIRM_ADMIN, maxApprovalAmount: 50000 },
      { role: UserRole.SUPER_ADMIN, maxApprovalAmount: null },
    ]) {
      const existing = await prisma.authorityLimit.findFirst({
        where: { tenantId, role: limit.role, adjusterId: null, category: null },
      });
      if (existing) {
        await prisma.authorityLimit.update({ where: { id: existing.id }, data: limit });
      } else {
        await prisma.authorityLimit.create({ data: { tenantId, ...limit } });
      }
    }
  }

  console.log('🔐 Authority limits seeded (adjusters cannot approve).');

  // Competency for the demo adjuster: seven recognised years in TRAVEL, plus a
  // start date old enough to clear the PD 12.3 supervision window — so demo
  // flows exercise the real seniority path rather than the unknown-data default.
  const demoAdjuster = await prisma.adjuster.findFirst({ where: { userId: adjusterUser.id } });
  if (demoAdjuster) {
    await prisma.adjuster.update({
      where: { id: demoAdjuster.id },
      data: { adjustingSince: new Date('2019-03-01') },
    });
    await prisma.adjusterCompetency.upsert({
      where: { adjusterId_category: { adjusterId: demoAdjuster.id, category: ClaimCategory.TRAVEL } },
      update: {},
      create: {
        adjusterId: demoAdjuster.id,
        category: ClaimCategory.TRAVEL,
        yearsInSubject: 7,
        casesHandled: 180,
        performanceSatisfactory: true,
        seniorRecognisedAt: new Date('2025-01-15'),
        seniorRecognisedByUserId: firmAdmin.id,
      },
    });
    console.log('🎓 Demo adjuster competency seeded (senior in TRAVEL).');
  }

  await seedFlowDefinitions(superAdmin.id);

  console.log('✅ Seeding completed.');
  console.log(
    `   Handling firm (ADJUSTING_FIRM) tenant id: ${adjusterTenant.id}` +
      ' — set HANDLING_FIRM_TENANT_ID to this value in the environment.'
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
