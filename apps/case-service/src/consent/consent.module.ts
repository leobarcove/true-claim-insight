import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

/**
 * Draft notices are installed on boot so the wording is visible and reviewable
 * immediately — but unapproved, so nothing can be recorded against them.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConsentModule.name);

  constructor(private readonly consent: ConsentService) {}

  async onApplicationBootstrap() {
    try {
      await this.consent.seedDraftNotices();
      const pending = await this.consent.pendingApproval();
      if (pending.length) {
        this.logger.warn(
          `${pending.length} consent notice version(s) await approval: ` +
            pending.map(p => `${p.purpose} v${p.version}`).join(', ') +
            '. Consent cannot be recorded until a named person approves them.'
        );
      }
    } catch (error) {
      this.logger.error(
        'Could not prepare consent notices',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
