import { Global, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaModule } from '../config/prisma.module';
import { NOTIFICATION_TRANSPORT } from './notification-transport.interface';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { SmtpTransport } from './smtp.transport';

/**
 * Outbound notifications (MASTER_PLAN §5 Phase 2 — deferred 31 Jul 2026,
 * un-deferred 4 Aug once staging hosting settled the provider question).
 *
 * Global because the events that trigger a notification are spread across
 * cases, assignments and the SLA sweep, and threading the module through each
 * import graph would be noise. The transport sits behind a token so SES,
 * SMS or WhatsApp can be added without touching any caller.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    SmtpTransport,
    { provide: NOTIFICATION_TRANSPORT, useExisting: SmtpTransport },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsModule.name);

  constructor(
    private readonly config: ConfigService,
    private readonly transport: SmtpTransport
  ) {}

  onApplicationBootstrap() {
    if (!this.config.get<boolean>('notifications.enabled')) {
      this.logger.log(
        'Notifications disabled — messages will be recorded SUPPRESSED ' +
          '(set NOTIFICATIONS_ENABLED=true to send)'
      );
      return;
    }

    if (!this.transport.isConfigured()) {
      // Loud, because enabled-but-unconfigured is the state where the system
      // believes it is telling people things and is not.
      this.logger.error(
        'Notifications are enabled but SMTP_HOST is not set — nothing will be sent'
      );
      return;
    }

    if (!this.config.get<string>('notifications.opsRecipient')) {
      this.logger.warn(
        'NOTIFICATIONS_OPS_RECIPIENT is not set — SLA breach escalations have nowhere to go'
      );
    }
  }
}
