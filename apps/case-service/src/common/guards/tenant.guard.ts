import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_KEY, TenantScope } from '../decorators/tenant.decorator';

/**
 * TenantGuard ensures tenant isolation for multi-tenant operations.
 *
 * This guard:
 * 1. Validates that the user has a valid tenantId in their JWT
 * 2. Injects tenantId into the request for downstream use
 * 3. Supports different tenant scopes (STRICT, FLEXIBLE, NONE)
 *
 * Usage:
 * - Apply globally or per-controller
 * - Use @TenantIsolation() decorator to configure scope
 * - Use @SkipTenantCheck() to bypass for specific routes
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    if (!user.tenantId) {
      this.logger.warn(`TenantGuard: User ${user.sub} has no tenantId`);
      throw new ForbiddenException('User is not associated with any tenant');
    }

    // Inject tenant context into request for downstream use
    request.tenantContext = {
      tenantId: user.tenantId,
      userId: user.sub,
      userRole: user.role,
      scope: tenantConfig.scope,
      allowCrossTenant: tenantConfig.allowCrossTenant || false,
    };

    this.logger.debug(
      `TenantGuard: User ${user.sub} accessing with tenant ${user.tenantId} (scope: ${tenantConfig.scope})`,
    );

    return true;
  }
}

/**
 * Interface for tenant context injected into request
 */
export interface TenantContext {
  tenantId: string;
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
