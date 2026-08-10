import type { PrismaService } from '../config/prisma.service';

/**
 * The single claim read that fraud-signal providers share.
 *
 * The provider context type is derived from this function's return type rather
 * than hand-written with `Prisma.ClaimGetPayload`, because a hand-written
 * payload type cannot see the client-level `omit` (SENSITIVE_FIELD_OMIT) and
 * would promise providers an `nricEncrypted` that is never actually loaded.
 * Deriving it means the two can never disagree.
 */
export const loadFraudClaim = (prisma: PrismaService, claimId: string) =>
  prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      claimant: true,
      adjuster: true,
      documents: true,
      floodClaim: true,
    },
  });

/** A claim as fraud providers see it — no ciphertext, no blind index. */
export type FraudClaim = NonNullable<Awaited<ReturnType<typeof loadFraudClaim>>>;
