import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../config/prisma.service';
import { QUEUE } from '../queue/queue.constants';
import { RenderedMessage, TemplateId } from './templates';

export interface EnqueueInput {
  tenantId: string;
  template: TemplateId;
  /** Rendered by the caller, which is what keeps template inputs type-checked. */
  message: RenderedMessage;
  /** Absent means nobody to tell — recorded SUPPRESSED, never silently dropped. */
  recipient?: string | null;
  /** Stops one event notifying twice; see the schema comment. */
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Payload carried on the queue.
 *
 * The rendered body travels here rather than on `NotificationLog`, because the
 * log is the permanent record and claimant-facing prose does not belong in a
 * plain Postgres column (see the schema comment). Redis holds it only until the
 * job is collected.
 */
export interface NotificationJob {
  logId: string;
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly queue: Queue
  ) {}

  /**
   * Record a notification and queue it for sending.
   *
   * **Never throws.** Every caller is in the middle of something more
   * important than a notification — acknowledging an appointment, asking a
   * claimant for a document, escalating a breach — and a mail failure must not
   * roll that back. Failures are logged loudly, the same posture as
   * `ComplianceEventsService.raiseQuietly`.
   */
  async enqueue(input: EnqueueInput): Promise<void> {
    try {
      if (!input.recipient) {
        await this.record(input, NotificationStatus.SUPPRESSED, 'No recipient address on file');
        this.logger.warn(
          `${input.template} not sent for ${input.entityType} ${input.entityId}: no address on file`
        );
        return;
      }

      const log = await this.record(input, NotificationStatus.QUEUED);
      if (!log) return; // duplicate — already handled

      await this.queue.add(
        'send',
        {
          logId: log.id,
          to: input.recipient,
          subject: input.message.subject,
          text: input.message.text,
        } satisfies NotificationJob,
        { jobId: log.id }
      );
    } catch (error) {
      // The business action has already happened; losing its notification is
      // bad but recoverable, and hiding the loss is worse than either.
      this.logger.error(
        `NOTIFICATION NOT QUEUED: ${input.template} for ${input.entityType} ${input.entityId}`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Insert the log row, or discover this event has already been notified.
   *
   * The unique constraint on `dedupeKey` is the arbiter rather than a prior
   * lookup: the SLA sweep runs every fifteen minutes and a worker restart
   * replays jobs, so two producers can race and both pass a `findFirst`.
   */
  private async record(input: EnqueueInput, status: NotificationStatus, error?: string) {
    try {
      return await this.prisma.notificationLog.create({
        data: {
          tenantId: input.tenantId,
          channel: NotificationChannel.EMAIL,
          template: input.template,
          recipient: input.recipient ?? '(none)',
          subject: input.message.subject,
          status,
          dedupeKey: input.dedupeKey,
          entityType: input.entityType,
          entityId: input.entityId,
          error,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.debug(`Already notified: ${input.dedupeKey}`);
        return null;
      }
      throw err;
    }
  }
}
