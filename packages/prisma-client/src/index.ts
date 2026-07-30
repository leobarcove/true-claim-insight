import { PrismaClient } from '@prisma/client';
import { SENSITIVE_FIELD_OMIT } from './sensitive-fields';

// The configured client's type is narrower than bare PrismaClient — `omit`
// removes the omitted fields from every default result type, which is what
// makes a forgotten opt-in a compile error rather than a runtime surprise.
const createClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    omit: SENSITIVE_FIELD_OMIT,
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

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

// Shared persistence for envelope-encryption data keys. Single implementation
// so no two services can disagree about which key version is active.
export { PrismaKeyStore } from './key-store';
export type { WrappedDataKey } from './key-store';

// Ciphertext and blind indexes are omitted from query results by default; the
// decrypting paths opt back in explicitly.
// One audit-row writer for every service, so the trail has a consistent shape.
export { AuditWriter } from './audit-writer';
export type { AuditRecord } from './audit-writer';
export { SENSITIVE_FIELD_OMIT } from './sensitive-fields';
export type { TciPrismaOptions } from './sensitive-fields';
export default prisma;
