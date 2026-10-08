import { ClaimantRetentionScheduler } from './claimant-retention.scheduler';

/**
 * Every copy of the gateway wakes at 04:00; only the one holding the advisory
 * lock may sweep. Two concurrent sweeps over the same claimants is the case
 * the lock exists to prevent.
 */
describe('ClaimantRetentionScheduler — one sweep across copies', () => {
  const build = (locked: boolean) => {
    const sweep = jest.fn(async () => undefined);
    const queryRaw = jest.fn(async () => [{ locked }]);
    const prisma = {
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>, options: unknown) => {
        expect(options).toEqual(expect.objectContaining({ timeout: expect.any(Number) }));
        return work({ $queryRaw: queryRaw });
      }),
    };
    const scheduler = new ClaimantRetentionScheduler({ sweep } as never, prisma as never);
    return { scheduler, sweep, queryRaw };
  };

  it('sweeps when it takes the lock', async () => {
    const { scheduler, sweep, queryRaw } = build(true);
    await scheduler.run();

    expect(sweep).toHaveBeenCalledTimes(1);
    const sql = (queryRaw.mock.calls[0] as unknown[])[0] as TemplateStringsArray;
    expect(Array.from(sql).join('?')).toMatch(/pg_try_advisory_xact_lock\(hashtext\(\?\)\)/);
  });

  it('skips when another copy holds the lock', async () => {
    const { scheduler, sweep } = build(false);
    await scheduler.run();

    expect(sweep).not.toHaveBeenCalled();
  });

  it('still does not throw when the sweep fails — the gateway must stay up', async () => {
    const { scheduler, sweep } = build(true);
    sweep.mockRejectedValueOnce(new Error('db down'));

    await expect(scheduler.run()).resolves.toBeUndefined();
  });
});
