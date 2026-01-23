import { PrismaClient, UserRole, TenantType, ClaimType, ClaimStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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

async function main() {
  console.log('🌱 Seeding database with demo data...');

  const password = 'DemoPass123!';
  const hashedPassword = await bcrypt.hash(password, 12);

  // 1. Create Tenants
  const insurerTenant = await prisma.tenant.upsert({
    where: { id: 'allianz-id' },
    update: {},
    create: {
      id: 'allianz-id',
      name: 'Allianz Insurance Malaysia',
      type: TenantType.INSURER,
      settings: {},
    },
  });

  const adjusterTenant = await prisma.tenant.upsert({
    where: { id: 'pacific-adjusters-id' },
    update: {},
    create: {
      id: 'pacific-adjusters-id',
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
    return prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword },
      create: {
        email,
        password: hashedPassword,
        fullName,
        phoneNumber,
        role,
        tenantId,
      },
    });
  };

  // 3. Create 10 Demo Users
  const superAdmin = await upsertUser(
    'superadmin@tci.com',
    'System Super Admin',
    UserRole.SUPER_ADMIN,
    '+60100000000'
  );
  const insurerAdmin = await upsertUser(
    'admin@allianz.com',
    'Allianz Admin',
    UserRole.INSURER_ADMIN,
    '+60100000001',
    insurerTenant.id
  );
  const firmAdmin = await upsertUser(
    'admin@pacific.com',
    'Pacific Admin',
    UserRole.FIRM_ADMIN,
    '+60100000002',
    adjusterTenant.id
  );
  const adjusterUser = await upsertUser(
    'adjuster@pacific.com',
    'Ahmad Adjuster',
    UserRole.ADJUSTER,
    '+60100000003',
    adjusterTenant.id
  );
  const insurerStaff = await upsertUser(
    'staff@allianz.com',
    'Siti Staff',
    UserRole.INSURER_STAFF,
    '+60100000004',
    insurerTenant.id
  );
  const siuInvestigator = await upsertUser(
    'siu@allianz.com',
    'Zul SIU',
    UserRole.SIU_INVESTIGATOR,
    '+60100000005',
    insurerTenant.id
  );
  const compliance = await upsertUser(
    'compliance@allianz.com',
    'Mei Compliance',
    UserRole.COMPLIANCE_OFFICER,
    '+60100000006',
    insurerTenant.id
  );
  const support = await upsertUser(
    'support@tci.com',
    'Support Team',
    UserRole.SUPPORT_DESK,
    '+60100000007'
  );
  const shariah = await upsertUser(
    'shariah@allianz.com',
    'Ustaz Shariah',
    UserRole.SHARIAH_REVIEWER,
    '+60100000008',
    insurerTenant.id
  );

  // Claimant is separate identity table
  const claimant = await prisma.claimant.upsert({
    where: { phoneNumber: '+60123456789' },
    update: {},
    create: {
      id: 'demo-claimant-id',
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
    where: { claimNumber: 'TC-2025-001' },
    update: {},
    create: {
      claimNumber: 'TC-2025-001',
      claimantId: claimant.id,
      adjusterId: adjusterProfile.id,
      insurerTenantId: insurerTenant.id,
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
    },
  });

  console.log('🚗 Sample claim created.');

  // 6. Run Vehicle Seed
  console.log('🚙 Seeding vehicle master data...');

  for (const [makeName, models] of Object.entries(MALAYSIA_CARS)) {
    const make = await prisma.vehicleMake.upsert({
      where: { name: makeName },
      update: {},
      create: { name: makeName },
    });

    for (const modelName of models) {
      await prisma.vehicleModel.upsert({
        where: {
          makeId_name: {
            makeId: make.id,
            name: modelName,
          },
        },
        update: {},
        create: {
          name: modelName,
          makeId: make.id,
        },
      });
    }
  }

  console.log('✅ Seeding completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
