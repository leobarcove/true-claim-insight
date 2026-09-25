import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../guards/tenant.guard';
import { TenantScope } from '../decorators/tenant.decorator';
import { assertClaimAccess } from './claim-access';
import { QuantumService } from '../../quantum/quantum.service';
import { BillingService } from '../../billing/billing.service';
import { AssignmentsService } from '../../assignments/assignments.service';
import { SlaController } from '../../sla/sla.controller';

/**
 * One rule for who may reach a claim (claim-access.ts), and the paths that
 * used to apply their own — or none (24 Sep 2026).
 *
 * The claim: owned by Pacific, worked by Pacific's adjuster, appointed by
 * Allianz.
 */

const CLAIM = {
  tenantId: 'pacific',
  insurerTenantId: 'allianz',
  claimantId: 'claimant-1',
  adjuster: { tenantId: 'pacific' },
};

const context = (overrides: Partial<TenantContext>): TenantContext => ({
  tenantId: 'pacific',
  tenantType: 'ADJUSTING_FIRM',
  userId: 'user-1',
  userRole: 'FIRM_ADMIN',
  scope: TenantScope.STRICT,
  allowCrossTenant: false,
  ...overrides,
});

const pacific = context({});
const allianz = context({ tenantId: 'allianz', tenantType: 'INSURER' });
const otherFirm = context({ tenantId: 'other-firm' });

const prismaWith = (claim: unknown) => ({ claim: { findUnique: jest.fn(async () => claim) } });

describe('assertClaimAccess — the one rule', () => {
  const allows = (ctx: TenantContext, claim: unknown = CLAIM) =>
    assertClaimAccess(prismaWith(claim) as never, 'claim-1', ctx);

  it('admits the owner, the assigned adjuster’s firm and the appointing insurer', async () => {
    await expect(allows(pacific)).resolves.toBeUndefined();
    await expect(allows(allianz)).resolves.toBeUndefined();
    await expect(
      allows(context({ tenantId: 'firm-b' }), {
        ...CLAIM,
        tenantId: 'allianz',
        adjuster: { tenantId: 'firm-b' },
      })
    ).resolves.toBeUndefined();
  });

  it('answers any other tenant as absence', async () => {
    await expect(allows(otherFirm)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps a claimant to their own claim', async () => {
    await expect(
      allows(context({ userRole: 'CLAIMANT', userId: 'claimant-1' }))
    ).resolves.toBeUndefined();
    await expect(
      allows(context({ userRole: 'CLAIMANT', userId: 'claimant-2' }))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a claim with no owner to everyone but the operator', async () => {
    const orphan = { ...CLAIM, tenantId: null, insurerTenantId: null, adjuster: null };
    await expect(allows(pacific, orphan)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the insurer reads the file it appointed out', () => {
  it('reads the quantum worksheet — a 404 until 24 Sep 2026', async () => {
    const worksheet = { id: 'ws-1', revision: 1 };
    const prisma = {
      claim: {
        findUnique: jest.fn(async ({ select }: any) =>
          select?.category ? { id: 'claim-1', tenantId: 'pacific', category: 'TRAVEL' } : CLAIM
        ),
      },
      quantumWorksheet: { findFirst: jest.fn(async () => worksheet) },
    };
    const quantum = new QuantumService(prisma as never, { record: jest.fn() } as never);
    await expect(quantum.current('claim-1', allianz)).resolves.toBe(worksheet);
    await expect(quantum.current('claim-1', otherFirm)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('billing is the firm billing the insurer', () => {
  const billing = () =>
    new BillingService(
      {
        ...prismaWith(CLAIM),
        disbursement: { create: jest.fn(async () => ({ id: 'd-1' })) },
        feeNote: { findUnique: jest.fn(async () => ({ id: 'note-1', claimId: 'claim-1' })) },
      } as never,
      { record: jest.fn() } as never
    );
  const disbursement = { description: 'Taxi', amount: 40, incurredAt: '2026-09-01' };

  it("refuses another firm's claim, as absence", async () => {
    await expect(
      billing().recordDisbursement('claim-1', disbursement, otherFirm)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses the insurer billing itself on the firm’s behalf', async () => {
    await expect(
      billing().recordDisbursement('claim-1', disbursement, allianz)
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(billing().issue('note-1', allianz)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("answers another firm's fee note as absent", async () => {
    await expect(billing().issue('note-1', otherFirm)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a disbursement on the firm’s own claim', async () => {
    await expect(billing().recordDisbursement('claim-1', disbursement, pacific)).resolves.toEqual({
      id: 'd-1',
    });
  });

  it('keeps the statement to the firm’s own receivables', async () => {
    const findMany = jest.fn(async (_args: { where: Record<string, unknown> }) => []);
    const service = new BillingService({ feeNote: { findMany } } as never, {} as never);
    await service.insurerStatement(pacific);
    expect(findMany.mock.calls[0]![0].where.claim).toEqual({
      OR: [{ tenantId: 'pacific' }, { adjuster: { tenantId: 'pacific' } }],
    });
    await expect(service.insurerStatement(allianz)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('opening the claim for an appointment', () => {
  it("refuses to link another firm's claim", async () => {
    const assignments = Object.assign(Object.create(AssignmentsService.prototype), {
      prisma: prismaWith(CLAIM),
      load: jest.fn(async () => ({
        handlingTenantId: 'other-firm',
        status: 'ACKNOWLEDGED',
        claimId: null,
      })),
    });
    await expect(assignments.linkClaim('a-1', 'claim-1', otherFirm)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('CSP 10.13 exceptional circumstances', () => {
  const controller = (visible: boolean) => {
    const sla = { recordExceptionalCircumstance: jest.fn() };
    const tenants = {
      validateClaimAccess: jest.fn(async () => {
        if (!visible) throw new NotFoundException('Claim not found');
      }),
    };
    return {
      sla,
      controller: new SlaController(sla as never, { record: jest.fn() } as never, tenants as never),
    };
  };
  const dto = {
    stage: 'FINAL_REPORT',
    ground: 'CATASTROPHE_EVENT',
    reason: 'flood',
    workingDays: 5,
  } as never;

  it('refuses the insurer excusing the firm’s lateness', async () => {
    const { sla, controller: c } = controller(true);
    await expect(c.recordExceptional('claim-1', dto, allianz)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(sla.recordExceptionalCircumstance).not.toHaveBeenCalled();
  });

  it("refuses another firm's claim before extending anything", async () => {
    const { sla, controller: c } = controller(false);
    await expect(c.recordExceptional('claim-1', dto, otherFirm)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(sla.recordExceptionalCircumstance).not.toHaveBeenCalled();
  });
});
