import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const claimants = await prisma.claimant.findMany();
  console.log('Claimants in DB:', claimants.length);
  claimants.forEach(c => console.log('  -', c.id, c.fullName));
}

main().finally(() => prisma.$disconnect());
