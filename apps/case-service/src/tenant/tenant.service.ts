import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';

/**
 * TenantService provides utilities for multi-tenant data access.
 *
 * Key responsibilities:
 * 1. Validate resource ownership against tenant context
 * 2. Build tenant-scoped query filters
 * 3. Provide helpers for cross-tenant admin operations
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a where clause with tenant filtering applied
   *
   * @param tenantContext - The tenant context from the request
   * @param existingWhere - Any existing where conditions
   * @param tenantField - The field name for tenant ID (default: 'tenantId')
   * @returns Combined where clause with tenant filter
   */
  buildTenantFilter<T extends Record<string, any>>(
    tenantContext: TenantContext | null,
    existingWhere: T = {} as T,
    tenantField: string = 'tenantId'
  ): T {
    if (!tenantContext || tenantContext.scope === TenantScope.NONE) {
      return existingWhere;
    }

    // For STRICT scope, always apply tenant filter
    // For FLEXIBLE scope, apply unless allowCrossTenant is true and user is admin
    if (
      tenantContext.scope === TenantScope.STRICT ||
      (tenantContext.scope === TenantScope.FLEXIBLE && !this.canAccessCrossTenant(tenantContext))
    ) {
      return {
        ...existingWhere,
        [tenantField]: tenantContext.tenantId,
      };
    }

    return existingWhere;
  }

  /**
   * Build tenant filter for claims (uses adjusterId relationship or insurerTenantId)
   */
  buildClaimTenantFilter(
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
      // Claims can be accessed if:
      // 1. The adjuster belongs to the same tenant, OR
      // 2. The insurer tenant matches
      const tenantConditions = [
        { adjuster: { tenantId: tenantContext.tenantId } },
        { insurerTenantId: tenantContext.tenantId },
      ];

      if (existingWhere.OR) {
        const { OR: existingOR, ...rest } = existingWhere;
        return {
          ...rest,
          AND: [...(rest.AND || []), { OR: existingOR }, { OR: tenantConditions }],
        } as any;
      }

      return {
        ...existingWhere,
        OR: tenantConditions,
      };
    }

    return existingWhere;
  }

  /**
   * Validate that a resource belongs to the user's tenant
   *
   * @param resourceTenantId - The tenant ID of the resource
   * @param tenantContext - The tenant context from the request
   * @param resourceName - Name of the resource for error messages
   * @throws ForbiddenException if tenant mismatch
   */
  validateTenantAccess(
    resourceTenantId: string | null,
    tenantContext: TenantContext,
    resourceName: string = 'Resource'
  ): void {
    if (tenantContext.scope === TenantScope.NONE) {
      return;
    }

    if (this.canAccessCrossTenant(tenantContext)) {
      return;
    }

    if (resourceTenantId !== tenantContext.tenantId) {
      this.logger.warn(
        `Tenant access violation: User ${tenantContext.userId} (tenant: ${tenantContext.tenantId}) ` +
          `attempted to access ${resourceName} belonging to tenant ${resourceTenantId}`
      );
      throw new ForbiddenException(
        `Access denied: ${resourceName} does not belong to your organisation`
      );
    }
  }

  /**
   * Validate claim access based on adjuster's tenant or insurer tenant
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

    const hasAccess =
      claim.adjuster?.tenantId === tenantContext.tenantId ||
      claim.insurerTenantId === tenantContext.tenantId;

    if (!hasAccess) {
      this.logger.warn(
        `Claim access violation: User ${tenantContext.userId} (tenant: ${tenantContext.tenantId}) ` +
          `attempted to access claim ${claimId}`
      );
      throw new ForbiddenException(
        'Access denied: This claim does not belong to your organisation'
      );
    }
  }

  /**
   * Check if user can access resources across tenants
   * Only SUPER_ADMIN and users with explicit allowCrossTenant flag
   */
  private canAccessCrossTenant(tenantContext: TenantContext): boolean {
    return (
      tenantContext.allowCrossTenant &&
      ['SUPER_ADMIN', 'INSURER_ADMIN'].includes(tenantContext.userRole)
    );
  }

  /**
   * Get tenant by ID with caching
   */
  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    return tenant;
  }

  /**
   * Validate tenant exists and is active
   */
  async validateTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    return !!tenant;
  }
}
