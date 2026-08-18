import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates if a tenant has access to a specific claim.
   */
  async validateClaimAccess(claimId: string, tenantContext: TenantContext): Promise<void> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { adjuster: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    // Adjusting Firm check
    if (claim.adjuster && claim.adjuster.tenantId === tenantContext.tenantId) {
      return;
    }

    // Standard Tenant check
    if ((claim as any).tenantId === tenantContext.tenantId) {
      return;
    }

    // Role-based escalation (e.g. Super Admin)
    if (tenantContext.userRole === 'SUPER_ADMIN') {
      return;
    }

    // Answered as absence, not refusal — the same rule case-service applies,
    // and it must be the same here or the pair of services disagree about
    // whether a claim exists (18 Aug 2026 audit).
    this.logger.warn(
      `Tenant ${tenantContext.tenantId} attempted unauthorized access to claim ${claimId}`
    );
    throw new NotFoundException(`Claim with ID ${claimId} not found`);
  }

  /**
   * Validates if a tenant has access to a specific session.
   */
  async validateSessionAccess(sessionId: string, tenantContext: TenantContext): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    if (tenantContext.userRole === 'SUPER_ADMIN' || tenantContext.userRole === 'SYSTEM') {
      return;
    }

    if (session.tenantId && session.tenantId !== tenantContext.tenantId) {
      // Check if it's the insurer tenant or adjuster
      const claim = await this.prisma.claim.findUnique({
        where: { id: session.claimId },
        include: { adjuster: true },
      });
      if (
        claim?.insurerTenantId !== tenantContext.tenantId &&
        (claim as any)?.tenantId !== tenantContext.tenantId &&
        claim?.adjuster?.tenantId !== tenantContext.tenantId
      ) {
        // Absence, not refusal, and worded exactly as the genuine miss above.
        // A session hangs off a claim, so a distinct answer here leaked the
        // existence of another firm's claims by their sessions instead — the
        // side door left open when claim reads were unified (18 Aug 2026).
        throw new NotFoundException(`Session with ID ${sessionId} not found`);
      }
    }
  }

  /**
   * Builds a Prisma filter that restricts results to the current tenant and user respectively.
   */
  buildTenantFilter(
    tenantContext: TenantContext | null,
    options: {
      tenantField?: string;
      userIdField?: string;
      enforceUser?: boolean;
    } = {}
  ): any {
    const { tenantField = 'tenantId', userIdField = 'userId', enforceUser = false } = options;

    if (!tenantContext || tenantContext.userRole === 'SUPER_ADMIN') {
      return {};
    }

    const tenantOrFilter = {
      OR: [
        { [tenantField]: tenantContext.tenantId },
        { claim: { insurerTenantId: tenantContext.tenantId } },
        { claim: { tenantId: tenantContext.tenantId } },
        { claim: { adjuster: { tenantId: tenantContext.tenantId } } },
      ],
    };

    if (enforceUser || (tenantContext.userRole === 'CLAIMANT' && userIdField)) {
      return {
        AND: [tenantOrFilter, { [userIdField]: tenantContext.userId }],
      };
    }

    return tenantOrFilter;
  }
}
