import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getMetadataStorage } from 'class-validator';

import { resolveEffectiveRole } from './effective-role';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { ROLES_KEY } from './decorators/roles.decorator';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import {
  AUTHENTICATED_KEY,
  DELEGATED_AUTHORISATION_KEY,
  INTERNAL_ROUTE_KEY,
} from './decorators/access.decorator';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';

/**
 * The gateway edge (September 2026 access-control rework):
 *
 *  - a role belongs to a membership in the active tenant, not to the person;
 *  - every route declares a rule, and the roles guard denies the rest;
 *  - self-registration grants no access, and a grant must fit TENANT_ROLES.
 */

const firmA = {
  tenantId: 'firm-a',
  role: 'FIRM_ADMIN',
  status: 'ACTIVE',
  tenant: { type: 'ADJUSTING_FIRM' },
};
const insurerX = {
  tenantId: 'insurer-x',
  role: 'ADJUSTER',
  status: 'ACTIVE',
  tenant: { type: 'INSURER' },
};

describe('resolveEffectiveRole — the role is the membership’s, for this request', () => {
  it('reads the membership for the requested tenant', () => {
    expect(
      resolveEffectiveRole({
        platformRole: 'ADJUSTER',
        requestedTenantId: 'firm-a',
        memberships: [firmA],
      })
    ).toEqual({ role: 'FIRM_ADMIN', tenantId: 'firm-a', tenantType: 'ADJUSTING_FIRM' });
  });

  it('ignores the legacy users.role column for anyone but the operator', () => {
    // users.role said COMPLIANCE_OFFICER; the membership says FIRM_ADMIN.
    expect(
      resolveEffectiveRole({
        platformRole: 'COMPLIANCE_OFFICER',
        sessionTenantId: 'firm-a',
        memberships: [firmA],
      }).role
    ).toBe('FIRM_ADMIN');
  });

  it('holds no role in a tenant it has no membership in', () => {
    const result = resolveEffectiveRole({
      platformRole: 'FIRM_ADMIN',
      requestedTenantId: 'insurer-x',
      memberships: [firmA],
    });
    expect(result.role).toBeNull();
  });

  it('holds no role through a suspended membership', () => {
    expect(
      resolveEffectiveRole({
        platformRole: 'FIRM_ADMIN',
        sessionTenantId: 'firm-a',
        memberships: [{ ...firmA, status: 'SUSPENDED' }],
      }).role
    ).toBeNull();
  });

  it('refuses an ACTIVE membership whose role cannot exist in that tenant', () => {
    const result = resolveEffectiveRole({
      platformRole: 'ADJUSTER',
      sessionTenantId: 'insurer-x',
      memberships: [insurerX],
    });
    expect(result.role).toBeNull();
    expect(result.refusal).toMatch(/cannot exist in a INSURER tenant/);
  });

  it('keeps the operator the operator, in or out of a tenant', () => {
    expect(resolveEffectiveRole({ platformRole: 'SUPER_ADMIN', memberships: [] }).role).toBe(
      'SUPER_ADMIN'
    );
  });

  it('holds no role with no tenant selected', () => {
    expect(
      resolveEffectiveRole({ platformRole: 'ADJUSTER', memberships: [firmA] }).role
    ).toBeNull();
  });
});

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

  it('refuses a route that declares no rule (the old default admitted every role)', () => {
    expect(allows({}, { role: 'FIRM_ADMIN' })).toBe(false);
    expect(allows({}, { role: 'SUPER_ADMIN' })).toBe(false);
  });

  it('admits public and internal routes', () => {
    expect(allows({ [IS_PUBLIC_KEY]: true }, undefined)).toBe(true);
    expect(allows({ [INTERNAL_ROUTE_KEY]: true }, undefined)).toBe(true);
  });

  it('admits any signed-in identity to an @Authenticated route, role or not', () => {
    expect(allows({ [AUTHENTICATED_KEY]: true }, { role: null })).toBe(true);
    expect(allows({ [AUTHENTICATED_KEY]: true }, undefined)).toBe(false);
  });

  it('forwards a delegated route only for an identity holding a role here', () => {
    const delegated = { [DELEGATED_AUTHORISATION_KEY]: 'case-service' };
    expect(allows(delegated, { role: 'ADJUSTER' })).toBe(true);
    expect(allows(delegated, { role: null })).toBe(false);
  });

  it('enforces a route-level role list even inside a delegated controller', () => {
    const rule = { [DELEGATED_AUTHORISATION_KEY]: 'case-service', [ROLES_KEY]: ['ADJUSTER'] };
    expect(allows(rule, { role: 'SUPPORT_DESK' })).toBe(false);
    expect(allows(rule, { role: 'ADJUSTER' })).toBe(true);
  });
});

describe('TenantGuard — access to a tenant is a membership', () => {
  const guard = new TenantGuard(
    { get: () => undefined } as unknown as Reflector,
    { get: () => undefined } as never
  );
  const run = async (user: Record<string, unknown>, header?: string) => {
    const request: Record<string, any> = { user, headers: header ? { 'x-tenant-id': header } : {} };
    await guard.canActivate(contextFor(request));
    return request.tenantContext;
  };

  it('admits staff whose role was resolved for the tenant they name', async () => {
    const context = await run(
      { id: 'u1', role: 'FIRM_ADMIN', activeTenantId: 'firm-a', tenantId: 'firm-a' },
      'firm-a'
    );
    expect(context).toMatchObject({ tenantId: 'firm-a', userRole: 'FIRM_ADMIN' });
  });

  it('no longer lets the legacy primary tenant column stand in for a membership', async () => {
    await expect(
      guard.canActivate(
        contextFor({
          user: { id: 'u1', role: null, tenantId: 'firm-a', activeTenantId: 'firm-a' },
          headers: {},
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('self-registration grants a person, never access', () => {
  it('accepts no role and no tenant from the body', () => {
    const properties = getMetadataStorage()
      .getTargetValidationMetadatas(RegisterDto, '', true, false)
      .map(metadata => metadata.propertyName);
    expect(properties).toEqual(expect.arrayContaining(['email', 'password', 'fullName']));
    expect(properties).not.toContain('role');
    expect(properties).not.toContain('tenantId');
  });
});

describe('granting a membership', () => {
  const service = (tenantType: string | null) =>
    new UsersService({
      tenant: { findUnique: jest.fn(async () => (tenantType ? { type: tenantType } : null)) },
    } as never);
  const firmAdmin = { role: 'FIRM_ADMIN', activeTenantId: 'firm-a' };

  it.each(['SUPER_ADMIN', 'CLAIMANT'])('never grants %s', async role => {
    await expect(
      service('ADJUSTING_FIRM').assertMembershipGrantable({ tenantId: 'firm-a', role }, firmAdmin)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps a firm administrator inside their own organisation', async () => {
    await expect(
      service('INSURER').assertMembershipGrantable(
        { tenantId: 'insurer-x', role: 'FIRM_ADMIN' },
        firmAdmin
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an adjuster inside an insurer, even for the operator', async () => {
    await expect(
      service('INSURER').assertMembershipGrantable(
        { tenantId: 'insurer-x', role: 'ADJUSTER' },
        { role: 'SUPER_ADMIN', activeTenantId: null }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('grants a role that fits the tenant', async () => {
    await expect(
      service('ADJUSTING_FIRM').assertMembershipGrantable(
        { tenantId: 'firm-a', role: 'ADJUSTER' },
        firmAdmin
      )
    ).resolves.toEqual({ tenantId: 'firm-a', role: 'ADJUSTER' });
  });
});

describe('a PIAM agent signs in as an intake agent', () => {
  it('holds INTAKE_AGENT in its linked agency, never ADJUSTER', async () => {
    const { AuthService } = await import('./auth.service');
    const agent = {
      id: 'agent-1',
      registrationNumber: '999999-01',
      agentName: 'An Agent',
      agencyName: 'An Agency',
      phoneNumber: '+60199990201',
      tenantId: 'insurer-x',
      tenantName: 'Insurer X',
    };
    const service = new AuthService(
      { findPiamRegisteredAgentById: jest.fn(async () => agent) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    const user: any = await service.validateJwtPayload({
      sub: 'agent-1',
      role: 'INTAKE_AGENT',
      tenantId: 'insurer-x',
      currentTenantId: 'insurer-x',
      identityType: 'PIAM_AGENT',
    } as never);
    expect(user.role).toBe('INTAKE_AGENT');
    expect(user.activeTenantId).toBe('insurer-x');
  });
});
