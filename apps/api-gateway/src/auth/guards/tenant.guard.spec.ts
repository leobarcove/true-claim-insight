import { ForbiddenException } from '@nestjs/common';

import { TenantGuard } from './tenant.guard';

const contextFor = (user: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const request = { user, headers } as Record<string, any>;
  return {
    request,
    context: {
      getHandler: () => null,
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
};

describe('TenantGuard claimant intake tenant', () => {
  const reflector = { get: jest.fn().mockReturnValue(false) };
  const config = {
    get: jest.fn((key: string) =>
      key === 'HANDLING_FIRM_TENANT_ID' ? 'tenant-handling' : undefined
    ),
  };
  const guard = new TenantGuard(reflector as never, config as never);

  it('uses the configured handling firm for a first-time claimant', async () => {
    const { request, context } = contextFor({ id: 'claimant-1', role: 'CLAIMANT' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.tenantContext).toEqual({
      tenantId: 'tenant-handling',
      userId: 'claimant-1',
      userRole: 'CLAIMANT',
    });
  });

  it('does not let a tenantless claimant choose a tenant in a header', async () => {
    const { context } = contextFor(
      { id: 'claimant-1', role: 'CLAIMANT' },
      { 'x-tenant-id': 'tenant-arbitrary' }
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still fails closed when no handling firm is configured', async () => {
    const noConfig = new TenantGuard(reflector as never, { get: jest.fn() } as never);
    const { context } = contextFor({ id: 'claimant-1', role: 'CLAIMANT' });

    await expect(noConfig.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
