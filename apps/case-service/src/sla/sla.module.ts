import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { PrismaModule } from '../config/prisma.module';
import { SlaController } from './sla.controller';
import { SlaProcessor } from './sla.processor';
import { SlaService } from './sla.service';

/**
 * SLA clocks (docs/MASTER_PLAN.md §3.2, PD 12.5).
 *
 * The recurring sweep is scheduled on bootstrap rather than by a migration or a
 * manual step, so a freshly deployed instance starts honouring deadlines without
 * anyone remembering to switch it on. BullMQ deduplicates by job key, so every
 * replica scheduling it is harmless.
 */
@Module({
  imports: [PrismaModule, ComplianceModule],
  controllers: [SlaController],
  providers: [SlaService, SlaProcessor],
  exports: [SlaService],
})
export class SlaModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlaModule.name);

  constructor(private readonly sla: SlaService) {}

  async onApplicationBootstrap() {
    try {
      await this.sla.scheduleSweep();
    } catch (error) {
      // A queue that will not accept the sweep is serious, but it must not stop
      // the service booting — claims handling has to continue while it is fixed.
      this.logger.error(
        'Could not schedule the SLA sweep. Deadlines will not be evaluated until this is resolved.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
