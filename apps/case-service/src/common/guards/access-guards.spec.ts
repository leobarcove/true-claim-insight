import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { INTERNAL_ROUTE_KEY } from '../decorators/access.decorator';
import { TENANT_KEY, TenantScope } from '../decorators/tenant.decorator';
import { InternalAuthGuard } from './internal-auth.guard';
import { RolesGuard, UserRole } from './roles.guard';
import { TenantGuard } from './tenant.guard';

/**
 * The case-service edge: identity from the gateway's headers, then roles
 * (deny by default), then the tenant — with the tenant's type, which decides
 * whether a role may exist there at all.
 */

const contextFor = (request: Record<string, any>) =>
  ({
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const reflectorWith = (metadata: Record<string, unknown>) =>
  ({ getAllAndOverride: (key: string) => metadata[key] }) as unknown as Reflector;

describe('RolesGuard — deny by default', () => {
  const allows = (metadata: Record<string, unknown>, user: unknown) =>
    new RolesGuard(reflectorWith(metadata)).canActivate(contextFor({ user }));

  it('refuses a route that declares no rule, whoever calls it', () => {
    expect(allows({}, { role: UserRole.FIRM_ADMIN })).toBe(false);
    expect(allows({}, { role: UserRole.SUPER_ADMIN })).toBe(false);
  });

  it('admits public and internal routes without an identity', () => {
    expect(allows({ [IS_PUBLIC_KEY]: true }, undefined)).toBe(true);
    expect(allows({ [INTERNAL_ROUTE_KEY]: true }, undefined)).toBe(true);
  });

  it('admits only the declared roles, and the operator', () => {
    const rule = { [ROLES_KEY]: [UserRole.ADJUSTER] };
    expect(allows(rule, { role: UserRole.ADJUSTER })).toBe(true);
    expect(allows(rule, { role: UserRole.SUPPORT_DESK })).toBe(false);
    expect(allows(rule, { role: UserRole.SUPER_ADMIN })).toBe(true);
  });

  it('refuses an identity that arrived with no role', () => {
    expect(allows({ [ROLES_KEY]: [UserRole.ADJUSTER] }, { role: null })).toBe(false);
  });
});

describe('InternalAuthGuard', () => {
  const config = { get: () => 'k' } as never;

  it('never supplies a default role — a missing header is no role', () => {
    const request = {
      headers: { 'x-user-id': 'u1', 'x-tenant-id': 't1', 'x-internal-key': 'k' },
    } as Record<string, any>;
    new InternalAuthGuard(config, reflectorWith({})).canActivate(contextFor(request));
    expect(request.user.role).toBeNull();
  });

  it('lets public and internal routes through to their own guards', () => {
    for (const key of [IS_PUBLIC_KEY, INTERNAL_ROUTE_KEY]) {
      const guard = new InternalAuthGuard(config, reflectorWith({ [key]: true }));
      expect(guard.canActivate(contextFor({ headers: {} }))).toBe(true);
    }
  });
});

describe('TenantGuard — the tenant type', () => {
  const guardFor = (tenantType: string | null) =>
    new TenantGuard(reflectorWith({ [TENANT_KEY]: { scope: TenantScope.STRICT } }), {
      getTenantType: jest.fn(async () => tenantType),
    } as never);

  it('attaches the type for the independence rules to read', async () => {
    const request: Record<string, any> = {
      user: { sub: 'u1', tenantId: 't1', role: UserRole.ADJUSTER },
    };
    await expect(guardFor('ADJUSTING_FIRM').canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.tenantContext.tenantType).toBe('ADJUSTING_FIRM');
  });

  it('refuses a role that cannot exist in that kind of tenant', async () => {
    const request = { user: { sub: 'u1', tenantId: 't1', role: UserRole.ADJUSTER } };
    await expect(guardFor('INSURER').canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('refuses a staff role in a tenant that does not exist', async () => {
    const request = { user: { sub: 'u1', tenantId: 'gone', role: UserRole.FIRM_ADMIN } };
    await expect(guardFor(null).canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('does not look up the operator placeholder tenant', async () => {
    const tenants = { getTenantType: jest.fn() };
    const guard = new TenantGuard(
      reflectorWith({ [TENANT_KEY]: { scope: TenantScope.STRICT } }),
      tenants as never
    );
    const request: Record<string, any> = {
      user: { sub: 'op', tenantId: 'SUPER_ADMIN', role: UserRole.SUPER_ADMIN },
    };
    await guard.canActivate(contextFor(request));
    expect(tenants.getTenantType).not.toHaveBeenCalled();
    expect(request.tenantContext.tenantType).toBeNull();
  });
});
