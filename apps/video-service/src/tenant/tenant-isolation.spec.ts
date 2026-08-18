import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantScope } from '../common/decorators/tenant.decorator';
import type { TenantContext } from '../common/guards/tenant.guard';

/**
 * SECURITY TESTS — a blocked read is indistinguishable from a missing record.
 *
 * `validateClaimAccess` disagreed with itself: the claimant branch answered a
 * claim belonging to someone else as absent, while the tenant branch two lines
 * later answered it as refused. So the same function leaked to a firm what it
 * correctly hid from a claimant (18 Aug 2026 audit).
 *
 * Sessions route through the claim check, so proving the claim rule holds
 * proves it for every room, recording and upload addressed by session id.
 */
describe('TenantService — refusal is answered as absence', () => {
  const context = (tenantId: string, userRole = 'ADJUSTER', userId = 'user-1'): TenantContext => ({
    tenantId,
    userId,
    userRole,
    scope: TenantScope.STRICT,
    allowCrossTenant: false,
  });

  const service = (claim: unknown, session: unknown = null) =>
    new TenantService({
      claim: { findUnique: jest.fn().mockResolvedValue(claim) },
      session: { findUnique: jest.fn().mockResolvedValue(session) },
    } as never);

  const foreignClaim = {
    id: 'claim-1',
    claimantId: 'someone-else',
    tenantId: 'other-firm',
    insurerTenantId: 'other-insurer',
    adjuster: { tenantId: 'other-firm' },
  };

  it('answers another firm’s claim exactly as a claim that does not exist', async () => {
    const absent = await service(null)
      .validateClaimAccess('claim-1', context('mine'))
      .catch(e => e);
    const blocked = await service(foreignClaim)
      .validateClaimAccess('claim-1', context('mine'))
      .catch(e => e);

    expect(absent).toBeInstanceOf(NotFoundException);
    expect(blocked).toBeInstanceOf(NotFoundException);
    expect(blocked.message).toBe(absent.message);
  });

  it('gives a claimant the same answer it gives a firm', async () => {
    const asClaimant = await service(foreignClaim)
      .validateClaimAccess('claim-1', context('mine', 'CLAIMANT', 'not-the-claimant'))
      .catch(e => e);
    const asFirm = await service(foreignClaim)
      .validateClaimAccess('claim-1', context('mine'))
      .catch(e => e);

    expect(asClaimant).toBeInstanceOf(NotFoundException);
    expect(asClaimant.message).toBe(asFirm.message);
  });

  it('answers a session on another firm’s claim as a missing session', async () => {
    const session = { claimId: 'claim-1' };
    const blocked = await service(foreignClaim, session)
      .validateSessionAccess('session-1', context('mine'))
      .catch(e => e);

    expect(blocked).toBeInstanceOf(NotFoundException);
  });

  it('still lets the adjusting firm behind the claim through', async () => {
    const mine = {
      id: 'claim-1',
      claimantId: 'c1',
      tenantId: 'other',
      insurerTenantId: 'other',
      adjuster: { tenantId: 'mine' },
    };
    await expect(
      service(mine, { claimId: 'claim-1' }).validateSessionAccess('session-1', context('mine'))
    ).resolves.toBeUndefined();
  });
});
