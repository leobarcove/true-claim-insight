import { Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { TenantContext } from '../guards/tenant.guard';
import { TenantScope } from '../decorators/tenant.decorator';

const logger = new Logger('ClaimAccess');

/**
 * The one rule for who may reach a claim. Every service that takes a claim id
 * calls this — directly, or through `TenantService.validateClaimAccess`, which
 * delegates here — and `claim-access-coverage.spec.ts` fails the build on a
 * service method that takes a claim id without it.
 *
 * A claim is visible to:
 *  - the tenant that owns it (`claim.tenantId`);
 *  - the adjusting firm of the adjuster assigned to it;
 *  - the insurer that appointed the firm (`insurerTenantId`) — the customer is
 *    the insurer's and it may read the adjuster's file (FSA Sch 11 item 17).
 *    Whether it may *write* is a separate rule (`assertMayAuthorAdjusterWork`);
 *  - a claimant, for their own claim only;
 *  - the platform operator outside any tenant.
 *
 * Until 24 Sep 2026 quantum, assessment, SLA and billing each carried their
 * own owner-only comparison. The appointing insurer could open the claim and
 * its report but got a 404 on the quantum; billing checked nothing at all on
 * three of its writes. One rule in one place is what stops them drifting again.
 *
 * Refuses as absence (404): a 403 would confirm the id names a real claim.
 */
export async function assertClaimAccess(
  prisma: Pick<PrismaService, 'claim'>,
  claimId: string,
  tenantContext: TenantContext
): Promise<void> {
  if (
    tenantContext.scope === TenantScope.NONE ||
    (tenantContext.allowCrossTenant && tenantContext.userRole === 'SUPER_ADMIN')
  ) {
    return;
  }

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: {
      tenantId: true,
      insurerTenantId: true,
      claimantId: true,
      adjuster: { select: { tenantId: true } },
    },
  });

  if (!claim) {
    throw new NotFoundException(`Claim with ID ${claimId} not found`);
  }

  if (tenantContext.userRole === 'CLAIMANT') {
    if (claim.claimantId !== tenantContext.userId) {
      logger.warn(
        `Claim access violation: claimant ${tenantContext.userId} attempted claim ${claimId}`
      );
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }
    return;
  }

  const visible =
    claim.tenantId === tenantContext.tenantId ||
    claim.adjuster?.tenantId === tenantContext.tenantId ||
    claim.insurerTenantId === tenantContext.tenantId;

  if (!visible) {
    // Logged as the violation it is, answered as absence.
    logger.warn(
      `Claim access violation: user ${tenantContext.userId} (tenant ${tenantContext.tenantId}) ` +
        `attempted claim ${claimId}`
    );
    throw new NotFoundException(`Claim with ID ${claimId} not found`);
  }
}

/**
 * `assertClaimAccess` as a list filter: the claims this tenant context may
 * see, for queries that read many claims at once (reports, aggregates).
 *
 * The same rule, kept beside it so the two cannot drift: owner, assigned
 * adjuster's firm, appointing insurer; a claimant's own claims; everything for
 * the platform operator. Returns `undefined` when no restriction applies.
 *
 * Written after `SlaService.insurerMi` was found reading every tenant's SLA
 * clocks for any firm admin (8 Oct 2026) — there was no list form of the rule
 * to reach for, so the aggregate had none.
 */
export function claimVisibilityWhere(
  tenantContext: TenantContext
): Prisma.ClaimWhereInput | undefined {
  if (
    tenantContext.scope === TenantScope.NONE ||
    (tenantContext.allowCrossTenant && tenantContext.userRole === 'SUPER_ADMIN')
  ) {
    return undefined;
  }
  if (tenantContext.userRole === 'CLAIMANT') {
    return { claimantId: tenantContext.userId };
  }
  return {
    OR: [
      { tenantId: tenantContext.tenantId },
      { adjuster: { tenantId: tenantContext.tenantId } },
      { insurerTenantId: tenantContext.tenantId },
    ],
  };
}
