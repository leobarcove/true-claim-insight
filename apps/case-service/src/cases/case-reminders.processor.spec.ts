import { CaseRemindersProcessor } from './case-reminders.processor';

/**
 * The reminder sweep's three promises: only tenants that opted in, only cases
 * past their quiet period, and exactly one reminder per return — stamped
 * before anything is sent, so a delivery failure can never double-remind.
 */
describe('info-request reminder sweep', () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const setup = (over: {
    tenants?: Array<{ id: string; settings: unknown }>;
    cases?: Array<Record<string, unknown>>;
  }) => {
    const prisma = {
      tenant: {
        findMany: jest.fn(async () => over.tenants ?? []),
      },
      case: {
        findMany: jest.fn(async () => over.cases ?? []),
        update: jest.fn(async () => ({})),
      },
    };
    const notifications = { enqueue: jest.fn(async () => ({})) };
    const audit = { record: jest.fn(async () => undefined) };
    const infoRequests = { on: jest.fn(), emit: jest.fn() };

    const processor = new CaseRemindersProcessor(
      prisma as never,
      notifications as never,
      audit as never,
      infoRequests as never
    );
    return { processor, prisma, notifications, audit, infoRequests };
  };

  const dueCase = {
    id: 'case-1',
    caseNumber: 'CSE-2026-000050',
    tenantId: 'tenant-1',
    reviewNote: 'Please provide the boarding pass.',
    claimant: { email: 'leo@example.my', fullName: 'Leo Boey' },
  };

  it('does nothing when no tenant has opted in', async () => {
    const { processor, prisma, infoRequests } = setup({
      tenants: [{ id: 'tenant-1', settings: {} }],
    });

    const result = await processor.process();

    expect(result).toEqual({ reminded: 0 });
    // Not even the case query runs: absence of the setting is absence of the
    // feature, the same refuse-don't-default posture as the fast track.
    expect(prisma.case.findMany).not.toHaveBeenCalled();
    expect(infoRequests.emit).not.toHaveBeenCalled();
  });

  it('reminds a due case once: stamp first, then both doors', async () => {
    const { processor, prisma, notifications, audit, infoRequests } = setup({
      tenants: [{ id: 'tenant-1', settings: { infoRequestReminderDays: 3 } }],
      cases: [dueCase],
    });

    const result = await processor.process();

    expect(result).toEqual({ reminded: 1 });
    // The stamp is what makes the reminder singular.
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'case-1' },
        data: expect.objectContaining({ infoRequestRemindedAt: expect.any(Date) }),
      })
    );
    // Email door…
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'case.information-requested',
        recipient: 'leo@example.my',
        entityId: 'case-1',
      })
    );
    // …and the channel door, through the same port the original ask used.
    expect(infoRequests.emit).toHaveBeenCalledWith('case-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CASE_INFO_REQUEST_REMINDED', actorType: 'SYSTEM' })
    );
  });

  it('asks the database only for cases past the quiet period and not yet reminded', async () => {
    const { processor, prisma } = setup({
      tenants: [{ id: 'tenant-1', settings: { infoRequestReminderDays: 3 } }],
      cases: [],
    });

    await processor.process();

    const where = (prisma.case.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status).toBe('INFO_REQUESTED');
    expect(where.infoRequestRemindedAt).toBeNull();
    // The cutoff is roughly three days back — a minute of slack for the test.
    const cutoff = where.infoRequestedAt.lt as Date;
    expect(Math.abs(cutoff.getTime() - daysAgo(3).getTime())).toBeLessThan(60_000);
  });
});
