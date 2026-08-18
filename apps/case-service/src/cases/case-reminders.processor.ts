import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CaseStatus } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { render } from '../notifications/templates';
import { QUEUE } from '../queue/queue.constants';
import { tenantSettings } from '../tenant/tenant-settings';
import { InfoRequestEvents } from './info-request-events';

/**
 * The one reminder a returned case earns (MASTER_PLAN §8, 18 Aug).
 *
 * A case in INFO_REQUESTED waits on the claimant, and the ask was said once —
 * a claimant who missed that message got silence forever. This sweep sends
 * exactly one nudge per return, after the tenant's own quiet period
 * (`infoRequestReminderDays`, absent by default: chasing a claimant is a tone
 * decision each firm makes for itself).
 *
 * One reminder, never a drumbeat: `infoRequestRemindedAt` is set once and
 * only a fresh return re-arms it. A claimant reminded and still silent is a
 * decision for a person — which is what the abandon action exists for.
 *
 * Delivery reuses both existing doors: the email template the original ask
 * used (a reminder is the same ask, re-sent) and the InfoRequestEvents port,
 * so the bot re-says it on the claimant's own channel under the same guards —
 * no hijack of a live intake, silence in handover.
 */
@Processor(QUEUE.CASES)
export class CaseRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(CaseRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly infoRequests: InfoRequestEvents
  ) {
    super();
  }

  async process(): Promise<{ reminded: number }> {
    // Tenants that opted in, with their quiet periods.
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, settings: true },
    });
    const quietDays = new Map<string, number>();
    for (const tenant of tenants) {
      const days = tenantSettings(tenant.settings).infoRequestReminderDays;
      if (typeof days === 'number' && days > 0) quietDays.set(tenant.id, days);
    }
    if (quietDays.size === 0) return { reminded: 0 };

    let reminded = 0;
    for (const [tenantId, days] of quietDays) {
      const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const due = await this.prisma.case.findMany({
        where: {
          tenantId,
          status: CaseStatus.INFO_REQUESTED,
          infoRequestRemindedAt: null,
          infoRequestedAt: { not: null, lt: before },
        },
        select: {
          id: true,
          caseNumber: true,
          tenantId: true,
          reviewNote: true,
          claimant: { select: { email: true, fullName: true } },
        },
      });

      for (const caseRow of due) {
        // Stamped before sending: a delivery that fails is retried by the
        // queue's own backoff, but a stamp that fails after a send would
        // remind twice — and one is the promise.
        await this.prisma.case.update({
          where: { id: caseRow.id },
          data: { infoRequestRemindedAt: new Date() },
        });

        await this.notifications.enqueue({
          tenantId: caseRow.tenantId,
          template: 'case.information-requested',
          recipient: caseRow.claimant?.email ?? undefined,
          entityType: 'CASE',
          entityId: caseRow.id,
          message: render('case.information-requested', {
            caseNumber: caseRow.caseNumber,
            request: caseRow.reviewNote ?? 'the information our team asked for',
            claimantName: caseRow.claimant?.fullName ?? undefined,
          }),
        });
        // The channel half rides the same port the original ask used.
        this.infoRequests.emit(caseRow.id);

        await this.audit.record({
          entityId: caseRow.id,
          entityType: 'CASE',
          action: 'CASE_INFO_REQUEST_REMINDED',
          metadata: { quietDays: days },
          tenantId: caseRow.tenantId,
          userId: null,
          actorId: null,
          actorType: 'SYSTEM',
        });
        reminded += 1;
      }
    }

    if (reminded > 0) this.logger.log(`Info-request reminders sent: ${reminded}`);
    return { reminded };
  }
}
