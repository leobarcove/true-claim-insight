import { PrismaClient, UserRole, TenantType, ClaimType, ClaimStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
  const upsertUser = async (email: string, fullName: string, role: UserRole, phoneNumber: string, tenantId: string | null = null) => {
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
  const superAdmin = await upsertUser('superadmin@tci.com', 'System Super Admin', UserRole.SUPER_ADMIN, '+60100000000');
  const insurerAdmin = await upsertUser('admin@allianz.com', 'Allianz Admin', UserRole.INSURER_ADMIN, '+60100000001', insurerTenant.id);
  const firmAdmin = await upsertUser('admin@pacific.com', 'Pacific Admin', UserRole.FIRM_ADMIN, '+60100000002', adjusterTenant.id);
  const adjusterUser = await upsertUser('adjuster@pacific.com', 'Ahmad Adjuster', UserRole.ADJUSTER, '+60100000003', adjusterTenant.id);
  const insurerStaff = await upsertUser('staff@allianz.com', 'Siti Staff', UserRole.INSURER_STAFF, '+60100000004', insurerTenant.id);
  const siuInvestigator = await upsertUser('siu@allianz.com', 'Zul SIU', UserRole.SIU_INVESTIGATOR, '+60100000005', insurerTenant.id);
  const compliance = await upsertUser('compliance@allianz.com', 'Mei Compliance', UserRole.COMPLIANCE_OFFICER, '+60100000006', insurerTenant.id);
  const support = await upsertUser('support@tci.com', 'Support Team', UserRole.SUPPORT_DESK, '+60100000007');
  const shariah = await upsertUser('shariah@allianz.com', 'Ustaz Shariah', UserRole.SHARIAH_REVIEWER, '+60100000008', insurerTenant.id);
  
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
  console.log('✅ Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
