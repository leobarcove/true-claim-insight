import { PrismaClient, UserRole, TenantType, ClaimType, ClaimStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'test-tenant-id' },
    update: {},
    create: {
      id: 'test-tenant-id',
      name: 'Ahmad Adjusting Firm',
      type: TenantType.ADJUSTING_FIRM,
      settings: {},
    },
  });

  // 2. Create Adjuster User
  const hashedPassword = await bcrypt.hash('SecureP@ss123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'ahmad@adjustingfirm.com' },
    update: {
      password: hashedPassword,
    },
    create: {
      email: 'ahmad@adjustingfirm.com',
      password: hashedPassword,
      fullName: 'Ahmad bin Ismail',
      phoneNumber: '+60111111111',
      role: UserRole.ADJUSTER,
      licenseNumber: 'AJ-12345',
      tenantId: tenant.id,
    },
  });

  // 3. Create Adjuster Profile
  const adjuster = await prisma.adjuster.upsert({
    where: { email: 'ahmad@adjustingfirm.com' },
    update: {},
    create: {
      id: 'ahmad-adjuster-id',
      tenantId: tenant.id,
      licenseNumber: 'AJ-12345',
      fullName: 'Ahmad bin Ismail',
      email: 'ahmad@adjustingfirm.com',
      phoneNumber: '+60111111111',
      status: 'ACTIVE',
      bcillaCertified: true,
      amlaMember: true,
    },
  });

  // 4. Create Claimant
  const claimant = await prisma.claimant.upsert({
    where: { phoneNumber: '+60123123123' },
    update: {},
    create: {
      id: 'test-claimant-id',
      phoneNumber: '+60123123123',
      fullName: 'John Doe',
      nricHash: 'hash-nric-123',
      kycStatus: 'VERIFIED',
    },
  });

  // 5. Create Sample Claim
  await prisma.claim.upsert({
    where: { claimNumber: 'CLM-2023-0001' },
    update: {},
    create: {
      id: 'test-claim-id',
      claimNumber: 'CLM-2023-0001',
      claimantId: claimant.id,
      adjusterId: adjuster.id,
      insurerTenantId: tenant.id, // Usually a different tenant, but for mock purposes we use this
      policyNumber: 'POL-123456',
      claimType: ClaimType.OWN_DAMAGE,
      status: ClaimStatus.ASSIGNED,
      incidentDate: new Date('2023-11-20'),
      description: 'Front bumper damage due to collision with a pillar in a parking lot.',
      incidentLocation: { city: 'Kuala Lumpur', state: 'Selangor' },
      priority: 'NORMAL',
    },
  });

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
