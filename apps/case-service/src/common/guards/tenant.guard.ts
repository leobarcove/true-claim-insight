import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isRoleAllowedInTenant } from '@tci/shared-types';
import { TENANT_KEY, TenantScope } from '../decorators/tenant.decorator';
import { TenantService } from '../../tenant/tenant.service';

/**
 * TenantGuard ensures tenant isolation for multi-tenant operations.
 *
 * This guard:
 * 1. Validates that the user has a valid tenantId in their JWT
 * 2. Injects tenantId into the request for downstream use
 * 3. Supports different tenant scopes (STRICT, FLEXIBLE, NONE)
 * 4. Attaches the tenant's type, and refuses a role that cannot exist in it
 *    (TENANT_ROLES) — defence in depth behind the gateway's membership check,
 *    and the fact the independence rules turn on (`mayAuthorAdjusterWork`)
 *
 * Usage:
 * - Apply globally or per-controller
 * - Use @TenantIsolation() decorator to configure scope
 * - Use @SkipTenantCheck() to bypass for specific routes
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private reflector: Reflector,
    private readonly tenants: TenantService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get tenant scope configuration from decorator
    const tenantConfig = this.reflector.getAllAndOverride<{
      scope: TenantScope;
      allowCrossTenant?: boolean;
    }>(TENANT_KEY, [context.getHandler(), context.getClass()]);

    // If no tenant decorator or scope is NONE, skip tenant check
    if (!tenantConfig || tenantConfig.scope === TenantScope.NONE) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Validate user has tenant context
    if (!user) {
      this.logger.warn('TenantGuard: No user found in request');
      throw new ForbiddenException('Authentication required for tenant-scoped operations');
    }

    if (!user.tenantId && user.role !== 'SUPER_ADMIN') {
      this.logger.warn(`TenantGuard: User ${user.sub} has no tenantId`);
      throw new ForbiddenException('User is not associated with any tenant');
    }

    // The operator outside any tenant arrives with the placeholder tenant id
    // 'SUPER_ADMIN' (InternalAuthGuard); inside one, the gateway has already
    // made it that tenant's FIRM_ADMIN.
    const tenantType =
      user.tenantId && user.tenantId !== 'SUPER_ADMIN'
        ? await this.tenants.getTenantType(user.tenantId)
        : null;

    // Staff roles exist only where TENANT_ROLES allows them. The gateway
    // already resolved the role from the membership; this refuses a request
    // that reached here some other way, or a membership that predates the rule.
    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'CLAIMANT' &&
      !isRoleAllowedInTenant(user.role, tenantType)
    ) {
      this.logger.warn(
        `TenantGuard: role ${user.role} refused in ${tenantType ?? 'unknown'} tenant ${user.tenantId}`
      );
      throw new ForbiddenException('Your role does not exist in this organisation.');
    }

    // Inject tenant context into request for downstream use
    request.tenantContext = {
      tenantId: user.tenantId || user.role,
      tenantType,
      userId: user.sub,
      userRole: user.role,
      scope: user.role === 'SUPER_ADMIN' ? TenantScope.NONE : tenantConfig.scope,
      allowCrossTenant: user.role === 'SUPER_ADMIN' ? true : tenantConfig.allowCrossTenant || false,
    };

    this.logger.debug(
      `TenantGuard: User ${user.sub} accessing with tenant ${user.tenantId} (scope: ${tenantConfig.scope})`
    );

    return true;
  }
}

/**
 * Interface for tenant context injected into request
 */
export interface TenantContext {
  tenantId: string;
  /**
   * ADJUSTING_FIRM or INSURER; null for the platform operator outside any
   * tenant. Optional only so hand-built contexts in older call sites compile —
   * every rule that reads it treats absence as "not an adjusting firm".
   */
  tenantType?: string | null;
  userId: string;
  userRole: string;
  scope: TenantScope;
  allowCrossTenant: boolean;
}

/**
 * Extend Express Request to include tenant context
 */
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}
