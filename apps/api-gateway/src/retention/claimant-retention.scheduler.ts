import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../config/prisma.service';
import { ClaimantRetentionService } from './claimant-retention.service';

/**
 * Advisory-lock key for this job. One number per job, shared by every copy of
 * the gateway: Postgres hands it to one session at a time.
 */
const ANONYMISATION_LOCK = 'claimant-anonymisation';
/** Longer than any sweep should take; the lock is released when it ends. */
const SWEEP_TIMEOUT_MS = 30 * 60_000;

/**
 * Nightly claimant anonymisation.
 *
 * Scheduled rather than triggered, for the same reason the document purge is:
 * a retention obligation discharged only when someone remembers is not one.
 * 04:00, an hour after case-service's document sweep, so the claims context
 * has finished purging before identity is destroyed — a claimant is not
 * anonymised while documents naming them are still being examined.
 */
@Injectable()
export class ClaimantRetentionScheduler {
  private readonly logger = new Logger(ClaimantRetentionScheduler.name);

  constructor(
    private readonly retention: ClaimantRetentionService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Every copy of the gateway schedules this, so every copy wakes at 04:00.
   * Exactly one should sweep: the first to take a Postgres advisory lock. The
   * lock is transaction-scoped, so it is released when the sweep finishes or
   * fails, and if the process dies the database releases it with the
   * connection — no lease to expire, no lock row to clean up.
   *
   * A copy that wakes after the first has finished would sweep again. That is
   * harmless — anonymising an already-anonymised claimant changes nothing —
   * and the lock exists to stop the harmful case: two sweeps at once over the
   * same claimants.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'claimant-anonymisation' })
  async run() {
    try {
      await this.prisma.$transaction(
        async tx => {
          const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_xact_lock(hashtext(${ANONYMISATION_LOCK})) AS locked`;
          if (!locked) {
            this.logger.log('Anonymisation sweep already running on another instance — skipped');
            return;
          }
          await this.retention.sweep();
        },
        { timeout: SWEEP_TIMEOUT_MS, maxWait: 10_000 }
      );
    } catch (error) {
      // Loud, and swallowed: a failed sweep must not take the gateway down,
      // but a silent one would let personal data accumulate past its purpose
      // with nothing to show it had stopped running.
      this.logger.error(
        'CLAIMANT ANONYMISATION SWEEP FAILED — personal data may be retained past its purpose',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
