import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: '6ac03649-b57e-4159-8e46-df8d35c19058' },
    select: { id: true, fullName: true, role: true, tenantId: true }
  });
  console.log('User:', user);
  console.log('User tenantId:', user?.tenantId);
  
  const claim = await prisma.claim.findUnique({
    where: { id: '48f51d46-0a6f-4abf-abd5-5c7563018c0e' },
    include: { adjuster: { select: { tenantId: true } } }
  });
  console.log('Claim adjuster tenantId:', claim?.adjuster?.tenantId);
  console.log('Claim insurerTenantId:', claim?.insurerTenantId);
  
  // If mismatch, we need to either:
  // 1. Update the claim's adjuster tenant
  // 2. Or update the user's tenant
  if (user?.tenantId && claim?.adjuster?.tenantId !== user.tenantId) {
    console.log('MISMATCH DETECTED - updating claim adjuster to match user tenant');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
