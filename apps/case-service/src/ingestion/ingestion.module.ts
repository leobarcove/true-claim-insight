import { HttpModule } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { CasesModule } from '../cases/cases.module';
import { PrismaModule } from '../config/prisma.module';
import { QUEUE } from '../queue/queue.constants';
import { INBOUND_MAIL_SOURCE } from './inbound-mail.interface';
import { ImapMailSource } from './imap-mail.source';
import { HttpClaimantResolver } from '../chat/http-claimant-resolver';
import { CLAIMANT_RESOLVER, type ClaimantResolver } from '../chat/claimant-resolver.interface';
import { IngestionController } from './ingestion.controller';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionReviewService } from './ingestion-review.service';
import { IngestionService } from './ingestion.service';

/**
 * FNOL email intake (MASTER_PLAN §5 Phase 2).
 *
 * The mail source is bound to a token so the transport can change without the
 * pipeline knowing: IMAP suits a pilot against the mailbox the firm already
 * owns; SES inbound or a provider webhook can replace it later.
 *
 * Polling is scheduled only when intake is explicitly enabled. Defaulting it
 * on would mean every developer machine and every CI run connecting to a
 * production mailbox and consuming real claim notifications.
 */
@Module({
  imports: [PrismaModule, CasesModule, HttpModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionReviewService,
    IngestionProcessor,
    ImapMailSource,
    { provide: INBOUND_MAIL_SOURCE, useExisting: ImapMailSource },
    // Identity is the gateway's to write, so intake resolves a claimant
    // through it rather than upserting one here — the recorded resolution of
    // the case-service → claimant ownership exception.
    HttpClaimantResolver,
    { provide: CLAIMANT_RESOLVER, useExisting: HttpClaimantResolver },
  ],
  exports: [IngestionService],
})
export class IngestionModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionModule.name);

  constructor(
    @InjectQueue(QUEUE.INGESTION) private readonly queue: Queue,
    private readonly config: ConfigService,
    private readonly source: ImapMailSource
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.get<boolean>('fnolIntake.enabled')) {
      this.logger.log('FNOL intake disabled (set FNOL_INTAKE_ENABLED=true to poll)');
      return;
    }

    if (!this.source.isConfigured()) {
      // Loud, because the alternative is an intake mailbox that appears to be
      // running and silently receives nothing.
      this.logger.error(
        'FNOL intake is enabled but the IMAP settings are incomplete — no mail will be read. ' +
          'Set FNOL_IMAP_HOST, FNOL_IMAP_USER and FNOL_IMAP_PASSWORD.'
      );
      return;
    }

    const everyMs = this.config.get<number>('fnolIntake.pollIntervalMs') ?? 300_000;

    try {
      await this.queue.add(
        'poll',
        {},
        {
          repeat: { every: everyMs },
          jobId: 'fnol-poll',
          removeOnComplete: { count: 200 },
        }
      );
      this.logger.log(`FNOL mailbox poll scheduled every ${Math.round(everyMs / 1000)}s`);
    } catch (error) {
      this.logger.error(
        'Could not schedule the FNOL mailbox poll',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
