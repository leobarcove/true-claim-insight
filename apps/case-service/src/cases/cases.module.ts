import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CasesController } from './cases.controller';
import { CaseRemindersProcessor } from './case-reminders.processor';
import { InfoRequestEvents } from './info-request-events';
import { CasesService } from './cases.service';
import { DocumentValidationService } from './document-validation.service';
import { FlowsService } from './flows.service';
import { StorageService } from '../common/services/storage.service';
import { QUEUE } from '../queue/queue.constants';
import { TenantModule } from '../tenant/tenant.module';
import { ConsentModule } from '../consent/consent.module';
import { ClaimsModule } from '../claims/claims.module';
import { AssessmentModule } from '../assessment/assessment.module';

@Module({
  imports: [TenantModule, ConsentModule, ClaimsModule, AssessmentModule],
  controllers: [CasesController],
  providers: [
    CasesService,
    DocumentValidationService,
    FlowsService,
    StorageService,
    InfoRequestEvents,
    CaseRemindersProcessor,
  ],
  exports: [CasesService, FlowsService, InfoRequestEvents],
})
export class CasesModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(CasesModule.name);

  constructor(@InjectQueue(QUEUE.CASES) private readonly queue: Queue) {}

  /**
   * The info-request reminder sweep, hourly. Same reasoning as the retention
   * and SLA sweeps: a nudge nobody remembers to run is a reminder policy in
   * name only. Hourly rather than daily because the quiet period is measured
   * in days — an hourly check makes the reminder land within an hour of
   * falling due instead of up to a day late. BullMQ dedupes on the job id.
   */
  async onApplicationBootstrap() {
    try {
      await this.queue.add(
        'info-request-reminders',
        {},
        {
          repeat: { every: 60 * 60 * 1000 },
          jobId: 'info-request-reminders',
          removeOnComplete: { count: 100 },
        }
      );
      this.logger.log('Info-request reminder sweep scheduled hourly');
    } catch (error) {
      this.logger.error(
        'Could not schedule the info-request reminder sweep',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
