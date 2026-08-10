import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import type { Job } from 'bullmq';

import { PrismaService } from '../config/prisma.service';
import { QUEUE } from '../queue/queue.constants';
import {
  NOTIFICATION_TRANSPORT,
  NotificationTransport,
} from './notification-transport.interface';
import { NotificationJob } from './notifications.service';

/**
 * Sends queued notifications and records what happened.
 *
 * Every outcome writes back to the NotificationLog row, including the ones
 * nobody wants to look at. "The claimant was never told" and "we tried four
 * times and SES refused" are different facts, and only the row distinguishes
 * them afterwards.
 */
@Processor(QUEUE.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_TRANSPORT) private readonly transport: NotificationTransport
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<{ status: NotificationStatus }> {
    if (job.name !== 'send') {
      this.logger.warn(`Unknown notification job "${job.name}" ignored`);
      return { status: NotificationStatus.FAILED };
    }

    const { logId, to, subject, text } = job.data;

    if (!this.transport.isConfigured()) {
      // Not a failure: this environment is deliberately not sending. Recorded
      // so an operator sees the intent rather than an absence.
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.SUPPRESSED,
          error: 'Notifications are not enabled in this environment',
        },
      });
      return { status: NotificationStatus.SUPPRESSED };
    }

    try {
      await this.transport.send({ to, subject, text });

      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          error: null,
          attempts: { increment: 1 },
        },
      });

      this.logger.log(`Sent ${subject} → ${to}`);
      return { status: NotificationStatus.SENT };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          // FAILED is written on every attempt, not only the last. A row that
          // said QUEUED between retries would be indistinguishable from one
          // the worker never picked up.
          status: NotificationStatus.FAILED,
          error: message.slice(0, 500),
          attempts: { increment: 1 },
        },
      });

      this.logger.error(`Notification ${logId} failed: ${message}`);
      // Rethrown so BullMQ retries with the configured backoff.
      throw error;
    }
  }
}
