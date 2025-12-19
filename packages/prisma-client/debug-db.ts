import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("--- Users ---");
  const users = await prisma.user.findMany({
    select: { id: true, email: true, tenantId: true, role: true }
  });
  console.log(JSON.stringify(users, null, 2));

  console.log("\n--- Tenants ---");
  const tenants = await prisma.tenant.findMany();
  console.log(JSON.stringify(tenants, null, 2));

  console.log("\n--- Adjusters ---");
  const adjusters = await prisma.adjuster.findMany();
  console.log(JSON.stringify(adjusters, null, 2));

  console.log("\n--- Claims ---");
  const claims = await prisma.claim.findMany({
    include: {
      claimant: { select: { id: true, phoneNumber: true } },
      adjuster: { select: { id: true, fullName: true, tenantId: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(claims, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
