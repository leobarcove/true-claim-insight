import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../guards/tenant.guard';

export const TENANT_KEY = 'tenant_isolation';

export enum TenantScope {
  STRICT = 'STRICT',
  FLEXIBLE = 'FLEXIBLE',
  NONE = 'NONE',
}

export const TenantIsolation = (
  scope: TenantScope = TenantScope.STRICT,
  options?: { allowCrossTenant?: boolean },
) => SetMetadata(TENANT_KEY, { scope, ...options });

export const SkipTenantCheck = () => TenantIsolation(TenantScope.NONE);

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

export const TenantId = () => Tenant('tenantId');
