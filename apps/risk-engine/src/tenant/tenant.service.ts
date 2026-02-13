import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
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

    this.logger.warn(
      `Tenant ${tenantContext.tenantId} attempted unauthorized access to claim ${claimId}`
    );
    throw new ForbiddenException('You do not have access to this claim');
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
        throw new ForbiddenException('You do not have access to this session');
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

  /**
   * Validate that a resource belongs to the current user (and their tenant)
   */
  validateOwnership(
    resourceTenantId: string | null,
    resourceUserId: string | null,
    tenantContext: TenantContext,
    resourceName: string = 'Resource'
  ): void {
    if (tenantContext.userRole === 'SUPER_ADMIN') return;

    // Check tenant isolation (Simplified generic check)
    if (resourceTenantId && resourceTenantId !== tenantContext.tenantId) {
      throw new ForbiddenException(
        `Access denied: ${resourceName} does not belong to your organisation`
      );
    }

    if (resourceUserId !== tenantContext.userId && tenantContext.userRole === 'CLAIMANT') {
      throw new ForbiddenException(`Access denied: This ${resourceName} does not belong to you`);
    }
  }
}
