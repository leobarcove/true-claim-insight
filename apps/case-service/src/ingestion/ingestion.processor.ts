import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QUEUE } from '../queue/queue.constants';
import { IngestionService, PollOutcome } from './ingestion.service';

const EMPTY: PollOutcome = {
  fetched: 0,
  created: 0,
  needsReview: 0,
  failed: 0,
  duplicates: 0,
};

/**
 * Polls the FNOL mailbox on a schedule.
 *
 * A queue rather than a `setInterval` for the same reason as the SLA sweep:
 * intake must survive a restart and leave evidence that it ran. "No claims
 * arrived today" and "the poller has been dead since Tuesday" look identical
 * from the outside, and only one of them is acceptable.
 */
@Processor(QUEUE.INGESTION)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly ingestion: IngestionService) {
    super();
  }

  async process(job: Job): Promise<PollOutcome> {
    if (job.name !== 'poll') {
      this.logger.warn(`Unknown ingestion job "${job.name}" ignored`);
      return EMPTY;
    }

    const outcome = await this.ingestion.pollOnce();

    // Silence when there was nothing to do; a line per empty poll would bury
    // the ones that matter.
    if (outcome.fetched > 0) {
      this.logger.log(
        `FNOL poll: ${outcome.fetched} fetched, ${outcome.created} case(s) created, ` +
          `${outcome.needsReview} for review, ${outcome.failed} failed, ` +
          `${outcome.duplicates} already seen`
      );
    }

    return outcome;
  }
}
