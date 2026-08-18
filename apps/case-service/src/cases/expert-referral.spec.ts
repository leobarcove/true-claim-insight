import { BadRequestException } from '@nestjs/common';
import { CaseStatus, ExpertOutcome, TravelClaimType } from '@prisma/client';
import { CasesService } from './cases.service';

/**
 * A medical travel case can only convert through an expert, so what the
 * expert was asked and answered is part of the regulated record — PD 12.6
 * asks for the sources behind an assessment, and an expert is a source.
 */
describe('expert referral record', () => {
  const tenantContext = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'ADJUSTER',
  } as never;

  const build = (over: {
    caseRow?: Record<string, unknown>;
    referral?: Record<string, unknown> | null;
    settings?: unknown;
  }) => {
    const prisma = {
      case: {
        findUnique: jest.fn(async () => over.caseRow ?? null),
        update: jest.fn(async () => over.caseRow),
      },
      expertReferral: {
        create: jest.fn(async ({ data }: any) => ({ id: 'ref-1', ...data })),
        findFirst: jest.fn(async () => over.referral ?? null),
        findMany: jest.fn(async () => []),
        update: jest.fn(async ({ data }: any) => ({ id: 'ref-1', ...data })),
        count: jest.fn(async () => (over.referral ? 1 : 0)),
      },
      tenant: { findUnique: jest.fn(async () => ({ settings: over.settings ?? {} })) },
    };
    const audit = { record: jest.fn(async () => undefined) };
    const service = new CasesService(
      prisma as never, {} as never, {} as never, {} as never, {} as never,
      audit as never, {} as never, {} as never, {} as never, {} as never,
      { on: jest.fn(), emit: jest.fn() } as never, {} as never
    );
    return { service, prisma, audit };
  };

  const medicalCase = {
    id: 'case-1',
    tenantId: 'tenant-1',
    travelClaimType: TravelClaimType.MEDICAL,
    status: CaseStatus.REFERRED_TO_EXPERT,
    claimantId: 'claimant-1',
  };

  it('records the instruction when a case is referred', async () => {
    const { service, prisma } = build({ caseRow: { ...medicalCase, status: CaseStatus.SUBMITTED } });

    await service.referToExpert(
      'case-1',
      'Please confirm whether the condition was pre-existing.',
      tenantContext,
      'Dr Lim, Pantai'
    );

    expect(prisma.expertReferral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          question: 'Please confirm whether the condition was pre-existing.',
          expertName: 'Dr Lim, Pantai',
          referredByUserId: 'user-1',
        }),
      })
    );
  });

  it('records an outcome once, against the outstanding referral', async () => {
    const { service, prisma } = build({
      caseRow: medicalCase,
      referral: { id: 'ref-1', outcome: null },
    });

    await service.recordExpertOutcome(
      'case-1',
      { outcome: ExpertOutcome.PROCEED, opinion: 'Unrelated to any pre-existing condition.' },
      tenantContext
    );

    const data = (prisma.expertReferral.update as jest.Mock).mock.calls[0][0].data;
    expect(data.outcome).toBe(ExpertOutcome.PROCEED);
    expect(data.outcomeByUserId).toBe('user-1');
    // The query looked for an unanswered referral, not merely the newest.
    expect((prisma.expertReferral.findFirst as jest.Mock).mock.calls[0][0].where.outcome).toBeNull();
  });

  it('refuses an outcome when nothing is outstanding', async () => {
    // A second opinion is a second referral, not an edit of the first.
    const { service } = build({ caseRow: medicalCase, referral: null });

    await expect(
      service.recordExpertOutcome(
        'case-1',
        { outcome: ExpertOutcome.PROCEED, opinion: 'Fit to proceed in my view.' },
        tenantContext
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an opinion too thin to cite', async () => {
    const { service } = build({ caseRow: medicalCase, referral: { id: 'ref-1', outcome: null } });

    await expect(
      service.recordExpertOutcome(
        'case-1',
        { outcome: ExpertOutcome.DECLINE, opinion: 'no' },
        tenantContext
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * Identity belongs to the gateway (ownership exception #6, retired 18 Aug
 * 2026). A caller that reaches case-service with a phone but no claimantId
 * has skipped that resolution, and the case would be orphaned from its
 * claimant — so it is refused loudly rather than opened unattached.
 */
describe('claimant resolution is the gateway\'s, not ours', () => {
  const service = () =>
    new CasesService(
      { claimant: { upsert: jest.fn() } } as never, {} as never, {} as never,
      {} as never, {} as never, { record: jest.fn() } as never, {} as never,
      {} as never, {} as never, {} as never,
      { on: jest.fn(), emit: jest.fn() } as never, {} as never
    );

  const resolve = (dto: Record<string, unknown>, role = 'ADJUSTER') =>
    (service() as never as {
      resolveClaimantId(d: unknown, t: unknown): Promise<string | null>;
    }).resolveClaimantId(dto, { userRole: role, userId: 'user-1', tenantId: 't1' });

  it('refuses a phone with no id rather than writing identity itself', async () => {
    await expect(resolve({ claimantPhone: '+60123456789' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('takes the id the gateway resolved', async () => {
    await expect(resolve({ claimantId: 'claimant-7' })).resolves.toBe('claimant-7');
  });

  it('still trusts a claimant’s own JWT subject', async () => {
    // Self-serve needs no resolution: the token's sub IS the claimant.
    await expect(resolve({}, 'CLAIMANT')).resolves.toBe('user-1');
  });
});
