import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract tenant ID from request
 * Gets the current tenant context from the authenticated user
 */
export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return (
      request.tenantContext?.tenantId ||
      request.tenantId ||
      request.user?.currentTenantId ||
      request.user?.tenantId ||
      null
    );
  }
);

/**
 * Decorator to extract the current role from the tenant context
 */
export const CurrentTenantRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantContext?.userRole || request.user?.role || null;
  }
);

/**
 * Decorator to extract full tenant context object from request
 */
export const CurrentTenantContext = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.tenantContext;
});
