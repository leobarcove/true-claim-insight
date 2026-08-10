import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ClaimantRetentionService } from './claimant-retention.service';

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

  constructor(private readonly retention: ClaimantRetentionService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'claimant-anonymisation' })
  async run() {
    try {
      await this.retention.sweep();
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
