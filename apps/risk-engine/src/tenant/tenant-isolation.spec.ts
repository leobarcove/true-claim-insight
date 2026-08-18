import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import type { TenantContext } from '../common/guards/tenant.guard';

/**
 * SECURITY TESTS — a blocked read is indistinguishable from a missing record.
 *
 * risk-engine reads claims and sessions that case-service owns, so it must give
 * the same answer to "not yours" that case-service does. It did for claims and
 * did not for sessions: a session hangs off a claim, so a 403 there confirmed
 * the existence of another firm's claims through the side door (18 Aug 2026).
 *
 * The message is asserted as well as the status. Two different 404 messages
 * would rebuild the oracle one layer down.
 */
describe('TenantService — refusal is answered as absence', () => {
  const context = (tenantId: string, userRole = 'ADJUSTER'): TenantContext => ({
    tenantId,
    userId: 'user-1',
    userRole,
  });

  const service = (claim: unknown, session: unknown) =>
    new TenantService({
      claim: { findUnique: jest.fn().mockResolvedValue(claim) },
      session: { findUnique: jest.fn().mockResolvedValue(session) },
    } as never);

  describe('claims', () => {
    it('answers a claim in another tenant exactly as a claim that does not exist', async () => {
      const missing = service(null, null);
      const foreign = service(
        { id: 'claim-1', tenantId: 'other-firm', insurerTenantId: 'other-insurer', adjuster: null },
        null
      );

      const absent = await missing.validateClaimAccess('claim-1', context('mine')).catch(e => e);
      const blocked = await foreign.validateClaimAccess('claim-1', context('mine')).catch(e => e);

      expect(absent).toBeInstanceOf(NotFoundException);
      expect(blocked).toBeInstanceOf(NotFoundException);
      expect(blocked.message).toBe(absent.message);
    });

    it('still lets the owning firm through', async () => {
      const own = service({ id: 'claim-1', tenantId: 'mine', adjuster: null }, null);
      await expect(own.validateClaimAccess('claim-1', context('mine'))).resolves.toBeUndefined();
    });
  });

  describe('sessions', () => {
    const session = { id: 'session-1', tenantId: 'other-firm', claimId: 'claim-1' };
    const foreignClaim = {
      id: 'claim-1',
      tenantId: 'other-firm',
      insurerTenantId: 'other-insurer',
      adjuster: null,
    };

    it('answers a session on another firm’s claim exactly as a missing session', async () => {
      const missing = service(null, null);
      const foreign = service(foreignClaim, session);

      const absent = await missing
        .validateSessionAccess('session-1', context('mine'))
        .catch(e => e);
      const blocked = await foreign
        .validateSessionAccess('session-1', context('mine'))
        .catch(e => e);

      expect(absent).toBeInstanceOf(NotFoundException);
      expect(blocked).toBeInstanceOf(NotFoundException);
      expect(blocked.message).toBe(absent.message);
    });

    it('lets the adjusting firm behind the claim through', async () => {
      const mine = service(
        { id: 'claim-1', tenantId: 'other', insurerTenantId: 'other', adjuster: { tenantId: 'mine' } },
        session
      );
      await expect(
        mine.validateSessionAccess('session-1', context('mine'))
      ).resolves.toBeUndefined();
    });
  });
});
