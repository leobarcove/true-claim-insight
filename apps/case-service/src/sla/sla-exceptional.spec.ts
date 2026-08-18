import { BadRequestException } from '@nestjs/common';
import { SlaClockState, SlaExceptionalGround, SlaStage } from '@prisma/client';
import { SlaService } from './sla.service';

/**
 * CSP 10.13 lets the standard window give way in exceptional circumstances.
 * The relief must be deliberate, bounded, attributable and singular — because
 * a firm excusing itself is the record an examiner reads hardest.
 */
describe('CSP 10.13 exceptional circumstances', () => {
  const policy = { workingDays: 14, warnWorkingDaysBefore: 2, calendarState: 'KUALA_LUMPUR' };

  const setup = (clock: Record<string, unknown> | null) => {
    const prisma = {
      slaClock: {
        findFirst: jest.fn(async () => clock),
        update: jest.fn(async ({ data }: any) => ({ id: 'clock-1', ...data })),
      },
    };
    const service = new SlaService(prisma as never, { add: jest.fn() } as never);
    return { service, prisma };
  };

  const running = {
    id: 'clock-1',
    state: SlaClockState.BREACHED,
    dueAt: new Date('2026-08-14T00:00:00Z'),
    exceptionalGround: null,
    policy,
  };

  const valid = {
    ground: SlaExceptionalGround.CATASTROPHE_EVENT,
    reason: 'Klang Valley flood; the risk address was underwater until 20 Aug.',
    workingDays: 10,
    userId: 'user-1',
  };

  it('extends the deadline, records the ground, and clears a breach it should never have had', async () => {
    const { service, prisma } = setup(running);

    const result = await service.recordExceptionalCircumstance(
      'claim-1',
      SlaStage.FINAL_REPORT,
      valid
    );

    const data = (prisma.slaClock.update as jest.Mock).mock.calls[0][0].data;
    expect(data.exceptionalGround).toBe(SlaExceptionalGround.CATASTROPHE_EVENT);
    expect(data.exceptionalWorkingDays).toBe(10);
    expect(data.exceptionalByUserId).toBe('user-1');
    // The breach was measured against a window the PD did not require.
    expect(data.state).toBe(SlaClockState.RUNNING);
    expect(data.breachedAt).toBeNull();
    expect(data.dueAt.getTime()).toBeGreaterThan(running.dueAt.getTime());
    expect(result).not.toBeNull();
  });

  it('refuses a second extension on the same clock', async () => {
    // Buying time in small increments is how a deadline stops meaning
    // anything; a further extension is a fresh decision, not an adjustment.
    const { service } = setup({
      ...running,
      exceptionalGround: SlaExceptionalGround.COMPLEX_CLAIM,
    });

    await expect(
      service.recordExceptionalCircumstance('claim-1', SlaStage.FINAL_REPORT, valid)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an unbounded or unexplained extension', async () => {
    const { service } = setup(running);

    await expect(
      service.recordExceptionalCircumstance('claim-1', SlaStage.FINAL_REPORT, {
        ...valid,
        workingDays: 999,
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.recordExceptionalCircumstance('claim-1', SlaStage.FINAL_REPORT, {
        ...valid,
        reason: 'flood',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does nothing when there is no live clock to extend', async () => {
    const { service, prisma } = setup(null);

    const result = await service.recordExceptionalCircumstance(
      'claim-1',
      SlaStage.FINAL_REPORT,
      valid
    );

    expect(result).toBeNull();
    expect(prisma.slaClock.update).not.toHaveBeenCalled();
  });
});
