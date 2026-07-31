import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { StorageService } from '../common/services/storage.service';
import { PrismaModule } from '../config/prisma.module';
import { QUEUE } from '../queue/queue.constants';
import { RetentionController } from './retention.controller';
import { RetentionProcessor } from './retention.processor';
import { RetentionService } from './retention.service';

/**
 * PD 12.8 retention: seven-year floor, legal holds, scheduled purge.
 *
 * The sweep is scheduled on bootstrap, daily at 03:00 — the same reasoning as
 * the SLA sweep: a purge nobody remembers to run is a retention policy in name
 * only. BullMQ dedupes on the job id, so replicas scheduling it is harmless.
 */
@Module({
  imports: [PrismaModule],
  controllers: [RetentionController],
  providers: [RetentionService, RetentionProcessor, StorageService],
  exports: [RetentionService],
})
export class RetentionModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionModule.name);

  constructor(@InjectQueue(QUEUE.RETENTION) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    try {
      await this.queue.add(
        'sweep',
        {},
        { repeat: { pattern: '0 3 * * *' }, jobId: 'retention-sweep', removeOnComplete: { count: 30 } }
      );
      this.logger.log('Retention sweep scheduled daily at 03:00');
    } catch (error) {
      this.logger.error(
        'Could not schedule the retention sweep',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
