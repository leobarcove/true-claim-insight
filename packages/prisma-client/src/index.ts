import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';

// Data-ownership map + runtime enforcement (docs/MASTER_PLAN.md §4.3 A2).
// Explicit named re-exports, not `export *` — see the shared-types note about
// the CJS→ESM lexer being unable to see through tsc's __exportStar helper.
export {
  MODEL_OWNERSHIP,
  SERVICE_CONTEXTS,
  OWNERSHIP_EXCEPTIONS,
  checkOwnership,
  isWriteOperation,
} from './data-ownership';
export type { DataContext, OwnershipException, OwnershipVerdict } from './data-ownership';
export default prisma;
