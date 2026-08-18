import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';

/**
 * TenantService provides utilities for multi-tenant data access.
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a where clause with tenant and user filtering applied
   */
  buildTenantFilter<T extends Record<string, any>>(
    tenantContext: TenantContext | null,
    existingWhere: T = {} as T,
    options: {
      tenantField?: string;
      userIdField?: string;
      enforceUser?: boolean;
    } = {}
  ): T {
    const { tenantField = 'tenantId', userIdField = 'userId', enforceUser = false } = options;

    if (!tenantContext || tenantContext.scope === TenantScope.NONE) {
      return existingWhere;
    }

    if (
      tenantContext.scope === TenantScope.STRICT ||
      (tenantContext.scope === TenantScope.FLEXIBLE && !this.canAccessCrossTenant(tenantContext))
    ) {
      const filter: any = {
        [tenantField]: tenantContext.tenantId,
      };

      if (enforceUser || (tenantContext.userRole === 'CLAIMANT' && userIdField)) {
        filter[userIdField] = tenantContext.userId;
      }

      return {
        ...existingWhere,
        ...filter,
      };
    }

    return existingWhere;
  }

  /**
   * Build tenant filter for sessions
   */
  buildSessionTenantFilter(
    tenantContext: TenantContext | null,
    existingWhere: Record<string, any> = {}
  ): Record<string, any> {
    if (!tenantContext || tenantContext.scope === TenantScope.NONE) {
      return existingWhere;
    }

    if (
      tenantContext.scope === TenantScope.STRICT ||
      (tenantContext.scope === TenantScope.FLEXIBLE && !this.canAccessCrossTenant(tenantContext))
    ) {
      // If user is CLAIMANT, they should only see sessions for claims they own
      if (tenantContext.userRole === 'CLAIMANT') {
        return {
          ...existingWhere,
          claim: { claimantId: tenantContext.userId },
        };
      }

      // For ADJUSTER/INSURER, sessions can be accessed if:
      // 1. The adjuster belongs to the same tenant, OR
      // 2. The insurer tenant matches
      const tenantConditions = [
        { claim: { adjuster: { tenantId: tenantContext.tenantId } } },
        { claim: { insurerTenantId: tenantContext.tenantId } },
        { claim: { tenantId: tenantContext.tenantId } },
      ];

      return {
        ...existingWhere,
        OR: tenantConditions,
      };
    }

    return existingWhere;
  }

  /**
   * Validate that a claim belongs to the user's tenant or claimant
   */
  async validateClaimAccess(claimId: string, tenantContext: TenantContext): Promise<void> {
    if (tenantContext.scope === TenantScope.NONE || this.canAccessCrossTenant(tenantContext)) {
      return;
    }

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        adjuster: { select: { tenantId: true } },
      },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    // Claimant isolation check
    if (tenantContext.userRole === 'CLAIMANT') {
      if (claim.claimantId !== tenantContext.userId) {
        throw new NotFoundException(`Claim with ID ${claimId} not found`);
      }
      return;
    }

    const hasAccess =
      claim.adjuster?.tenantId === tenantContext.tenantId ||
      claim.insurerTenantId === tenantContext.tenantId ||
      (claim as any).tenantId === tenantContext.tenantId;

    if (!hasAccess) {
      this.logger.warn(
        `Claim access violation: User ${tenantContext.userId} (tenant: ${tenantContext.tenantId}) ` +
          `attempted to access claim ${claimId}`
      );
      // Absence, not refusal — the same answer the claimant branch above has
      // always given, and the same one case-service and risk-engine give. A
      // 403 here confirmed the claim existed in another firm's book.
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }
  }

  /**
   * Validate session access
   */
  async validateSessionAccess(sessionId: string, tenantContext: TenantContext): Promise<void> {
    if (tenantContext.scope === TenantScope.NONE || this.canAccessCrossTenant(tenantContext)) {
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { claimId: true },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${sessionId} not found`);
    }

    await this.validateClaimAccess(session.claimId, tenantContext);
  }

  /**
   * Check if user can access resources across tenants
   */
  private canAccessCrossTenant(tenantContext: TenantContext): boolean {
    return tenantContext.allowCrossTenant && ['SUPER_ADMIN'].includes(tenantContext.userRole);
  }
}
