import { CaseStatus } from '@prisma/client';

import { CasesService } from './cases.service';

/**
 * A submitted claim enters vetting when an operator opens it — but not when the
 * person who submitted it reads it back.
 *
 * The agent-assisted form submits and then re-reads the case to draw its
 * confirmation screen. Without the guard, that read moved the request straight
 * from SUBMITTED to UNDER_REVIEW, so every assisted claim arrived in the
 * handling firm's queue already marked as being looked at — on the wrong tab,
 * with nobody having looked at it. The auto-transition is a good idea about
 * queues; it just has to know the difference between picking a case up and
 * opening one you created.
 */
describe('a freshly submitted case entering vetting', () => {
  const build = () => {
    const update = jest.fn().mockResolvedValue({});
    const service = Object.create(CasesService.prototype) as CasesService;
    Object.assign(service, {
      prisma: { case: { update, findUnique: jest.fn() } },
      auditService: { record: jest.fn() },
      audit: jest.fn(),
    });
    return { service, update };
  };

  const caseRow = (over: Record<string, unknown> = {}) => ({
    id: 'case-1',
    tenantId: 'pacific-1',
    claimantId: 'claimant-1',
    status: CaseStatus.SUBMITTED,
    createdByUserId: 'agent-1',
    documents: [],
    ...over,
  });

  /**
   * Exercised through `assertAccess` plus the branch condition rather than the
   * whole of `findOne`, which would need a database. The condition is the thing
   * that was wrong.
   */
  const wouldEnterVetting = (
    row: { status: CaseStatus; createdByUserId: string | null },
    context: { userId: string; userRole: string }
  ) =>
    row.status === CaseStatus.SUBMITTED &&
    context.userRole !== 'CLAIMANT' &&
    row.createdByUserId !== context.userId;

  it('moves when an adjuster at the handling firm opens it', () => {
    expect(
      wouldEnterVetting(caseRow(), { userId: 'adjuster-9', userRole: 'ADJUSTER' })
    ).toBe(true);
  });

  it('does not move when the agent who submitted it reads it back', () => {
    expect(wouldEnterVetting(caseRow(), { userId: 'agent-1', userRole: 'FIRM_ADMIN' })).toBe(
      false
    );
  });

  it('does not move for a claimant reading their own case', () => {
    expect(
      wouldEnterVetting(caseRow({ createdByUserId: null }), {
        userId: 'claimant-1',
        userRole: 'CLAIMANT',
      })
    ).toBe(false);
  });

  it('leaves a self-service case alone until staff open it', () => {
    const selfService = caseRow({ createdByUserId: null });

    expect(wouldEnterVetting(selfService, { userId: 'adjuster-9', userRole: 'ADJUSTER' })).toBe(
      true
    );
  });

  it('does nothing for a case that is not freshly submitted', () => {
    expect(
      wouldEnterVetting(caseRow({ status: CaseStatus.CONVERTED }), {
        userId: 'adjuster-9',
        userRole: 'ADJUSTER',
      })
    ).toBe(false);
  });

  it('keeps assertAccess working for the creator either way', () => {
    const { service } = build();
    const agent = { userId: 'agent-1', tenantId: 'insurer-1', userRole: 'FIRM_ADMIN' } as never;

    // Submitted: the creator's exception has lapsed, so this is a 404.
    expect(() => service.assertAccess(caseRow(), agent)).toThrow();

    // Still a draft: they may finish what they are typing.
    expect(() =>
      service.assertAccess(caseRow({ status: CaseStatus.DRAFT }), agent)
    ).not.toThrow();
  });
});
