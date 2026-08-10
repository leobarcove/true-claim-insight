import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BnmChangeType } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { addWorkingDays } from '../sla/working-days';

/**
 * The PD 13.1 register: notifiable changes and whether BNM was told.
 *
 * The obligation binds a *registered* adjuster — seven working days from the
 * change — so as a TPA the register runs inert: rows draft, due dates compute,
 * nothing escalates. That is the licence-flip thesis applied to 13.1; on
 * registration the same rows become live obligations with real deadlines.
 *
 * Director/CEO/shareholder rows draft automatically from the KeyPerson
 * register, because the change that triggers 13.1(d) *is* a KeyPerson event —
 * a separate manual step would be a second chance to forget.
 */
@Injectable()
export class BnmNotificationsService {
  private readonly logger = new Logger(BnmNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /** Draft a notifiable change. Due date = occurredAt + 7 working days (KL). */
  async draft(
    data: { changeType: BnmChangeType; description: string; occurredAt: Date; keyPersonId?: string },
    actorUserId: string | null
  ) {
    const dueAt = addWorkingDays(data.occurredAt, 7, { state: 'KUALA_LUMPUR' });

    const notification = await this.prisma.bnmNotification.create({
      data: { ...data, dueAt },
    });

    await this.audit.record({
      entityType: 'BNM_NOTIFICATION',
      entityId: notification.id,
      action: 'BNM_NOTIFICATION_DRAFTED',
      actorId: actorUserId,
      newValues: { changeType: data.changeType, occurredAt: data.occurredAt, dueAt },
    });

    this.logger.log(
      `BNM notification drafted (${data.changeType}), due ${dueAt.toISOString().slice(0, 10)}`
    );
    return notification;
  }

  /** Record that BNM was notified — the reference is the proof. */
  async markNotified(id: string, reference: string, tenantContext: TenantContext) {
    if (!reference?.trim()) {
      throw new BadRequestException(
        'The submission reference is required — "we told BNM" needs something to point at.'
      );
    }
    const notification = await this.prisma.bnmNotification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.notifiedAt) {
      throw new BadRequestException('Already marked notified.');
    }

    const notifiedAt = new Date();
    const updated = await this.prisma.bnmNotification.update({
      where: { id },
      data: { notifiedAt, notifiedByUserId: tenantContext.userId, reference },
    });

    await this.audit.record({
      entityType: 'BNM_NOTIFICATION',
      entityId: id,
      action: 'BNM_NOTIFIED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: {
        reference,
        notifiedAt,
        // Late is recorded as late; the register does not blur it.
        late: notifiedAt.getTime() > notification.dueAt.getTime(),
      },
    });
    return updated;
  }

  /** The register: outstanding first, each row saying whether it is overdue. */
  async list() {
    const rows = await this.prisma.bnmNotification.findMany({
      orderBy: [{ notifiedAt: 'asc' }, { dueAt: 'asc' }],
    });
    const now = Date.now();
    return rows.map(row => ({
      ...row,
      overdue: !row.notifiedAt && now > row.dueAt.getTime(),
    }));
  }
}
