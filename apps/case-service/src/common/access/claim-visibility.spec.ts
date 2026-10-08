import { NotFoundException } from '@nestjs/common';
import { assertClaimAccess, claimVisibilityWhere } from './claim-access';
import { TenantScope } from '../decorators/tenant.decorator';
import { SlaService } from '../../sla/sla.service';

/**
 * `claimVisibilityWhere` is `assertClaimAccess` as a list filter. They must
 * agree on every claim for every caller, or a report shows a claim its own
 * page refuses — or, as `insurerMi` did until 8 Oct 2026, shows every tenant's
 * claims to any firm admin.
 *
 * The filter is evaluated here against the same fixtures the assertion sees,
 * so the two rules are compared rather than each checked against itself.
 */
describe('claim visibility — the list form agrees with assertClaimAccess', () => {
  const claims = [
    { id: 'own', tenantId: 'firm-a', insurerTenantId: 'ins-x', claimantId: 'c1', adjuster: { tenantId: 'firm-a' } },
    { id: 'assigned', tenantId: 'other', insurerTenantId: 'ins-y', claimantId: 'c2', adjuster: { tenantId: 'firm-a' } },
    { id: 'appointed', tenantId: 'firm-b', insurerTenantId: 'firm-a', claimantId: 'c3', adjuster: null },
    { id: 'foreign', tenantId: 'firm-b', insurerTenantId: 'ins-x', claimantId: 'c1', adjuster: { tenantId: 'firm-b' } },
  ];

  const contexts = {
    firmAdmin: { tenantId: 'firm-a', userId: 'u1', userRole: 'FIRM_ADMIN', scope: TenantScope.STRICT },
    claimant: { tenantId: null, userId: 'c1', userRole: 'CLAIMANT', scope: TenantScope.STRICT },
    operator: { tenantId: null, userId: 'op', userRole: 'SUPER_ADMIN', scope: TenantScope.STRICT, allowCrossTenant: true },
  } as const;

  /** A tiny evaluator for exactly the shapes claimVisibilityWhere produces. */
  const matches = (claim: (typeof claims)[number], where: Record<string, any> | undefined): boolean => {
    if (!where) return true;
    if (where.OR) return where.OR.some((clause: Record<string, any>) => matches(claim, clause));
    return Object.entries(where).every(([field, value]) =>
      field === 'adjuster' ? claim.adjuster?.tenantId === value.tenantId : (claim as any)[field] === value
    );
  };

  for (const [name, context] of Object.entries(contexts)) {
    it(`agrees for the ${name}`, async () => {
      const where = claimVisibilityWhere(context as never) as Record<string, any> | undefined;
      for (const claim of claims) {
        const prisma = { claim: { findUnique: jest.fn(async () => claim) } };
        const allowed = await assertClaimAccess(prisma as never, claim.id, context as never).then(
          () => true,
          error => {
            if (error instanceof NotFoundException) return false;
            throw error;
          }
        );
        expect({ claim: claim.id, visible: matches(claim, where) }).toEqual({ claim: claim.id, visible: allowed });
      }
    });
  }

  it('scopes insurerMi to the caller’s visible claims', async () => {
    const findMany = jest.fn(async () => []);
    const service = new SlaService({ slaClock: { findMany } } as never, {} as never);

    await service.insurerMi(contexts.firmAdmin as never);

    const [args] = findMany.mock.calls[0] as unknown as [Record<string, any>];
    expect(args.where.policy).toEqual({ monitorOnly: true });
    expect(args.where.claim).toEqual(claimVisibilityWhere(contexts.firmAdmin as never));
  });
});
