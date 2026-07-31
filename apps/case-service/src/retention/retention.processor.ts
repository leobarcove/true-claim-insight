import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE } from '../queue/queue.constants';
import { RetentionService } from './retention.service';

/**
 * Runs the retention sweep on the `retention` queue.
 *
 * Daily, off-peak. A purge that only ever happens when someone remembers to
 * trigger it is a retention policy in name only — records would accumulate
 * forever, which is its own PDPA problem (retention limitation cuts both ways:
 * keep at least seven years, but not indefinitely without reason).
 */
@Processor(QUEUE.RETENTION)
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(private readonly retention: RetentionService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'sweep') {
      this.logger.warn(`Unknown retention job "${job.name}" ignored`);
      return { examined: 0, purged: 0, kept: 0 };
    }
    return this.retention.sweep();
  }
}
