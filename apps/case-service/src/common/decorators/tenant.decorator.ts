import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../guards/tenant.guard';

export const TENANT_KEY = 'tenant_isolation';

/**
 * Tenant isolation scope levels
 */
export enum TenantScope {
  /**
   * STRICT: All queries MUST be filtered by tenantId
   * - Used for sensitive data (claims, documents, sessions)
   * - Cross-tenant access is forbidden
   */
  STRICT = 'STRICT',

  /**
   * FLEXIBLE: Tenant filtering is applied but can be overridden
   * - Used for admin operations
   * - Requires explicit allowCrossTenant flag
   */
  FLEXIBLE = 'FLEXIBLE',

  /**
   * NONE: No tenant filtering applied
   * - Used for public endpoints
   * - Used for system-level operations
   */
  NONE = 'NONE',
}

/**
 * Decorator to configure tenant isolation for a controller or route
 *
 * @param scope - The tenant scope level (STRICT, FLEXIBLE, NONE)
 * @param options - Additional configuration options
 *
 * @example
 * // Strict isolation - all queries filtered by tenant
 * @TenantIsolation(TenantScope.STRICT)
 * @Controller('claims')
 * export class ClaimsController {}
 *
 * @example
 * // Flexible - allows cross-tenant for admins
 * @TenantIsolation(TenantScope.FLEXIBLE, { allowCrossTenant: true })
 * @Get('all')
 * async getAllClaims() {}
 */
export const TenantIsolation = (
  scope: TenantScope = TenantScope.STRICT,
  options?: { allowCrossTenant?: boolean },
) => SetMetadata(TENANT_KEY, { scope, ...options });

/**
 * Decorator to skip tenant check for specific routes
 * Equivalent to @TenantIsolation(TenantScope.NONE)
 */
export const SkipTenantCheck = () => TenantIsolation(TenantScope.NONE);

/**
 * Parameter decorator to extract tenant context from request
 *
 * @example
 * @Get()
 * async findAll(@Tenant() tenant: TenantContext) {
 *   return this.service.findAll(tenant.tenantId);
 * }
 *
 * @example
 * // Get only tenantId
 * @Get()
 * async findAll(@Tenant('tenantId') tenantId: string) {
 *   return this.service.findAll(tenantId);
 * }
 */
export const Tenant = createParamDecorator(
  (data: keyof TenantContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenantContext = request.tenantContext as TenantContext;

    if (!tenantContext) {
      return null;
    }

    return data ? tenantContext[data] : tenantContext;
  },
);

/**
 * Shorthand decorator to get just the tenantId
 *
 * @example
 * @Get()
 * async findAll(@TenantId() tenantId: string) {
 *   return this.service.findAll(tenantId);
 * }
 */
export const TenantId = () => Tenant('tenantId');
