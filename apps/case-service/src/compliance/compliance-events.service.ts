import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ComplianceEventSeverity,
  ComplianceEventStatus,
  ComplianceEventType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';

/**
 * The compliance register (PD 11.2(d)).
 *
 * Raising is idempotent by dedupeKey and fail-soft when system-triggered — the
 * SLA sweep must not die because the register hiccuped — but every lifecycle
 * act on an event (acknowledge, resolve, report to Board) is by a named person
 * with the acts audited. Resolution requires a note: "how it was dealt with" is
 * what the Board reads.
 */
@Injectable()
export class ComplianceEventsService {
  private readonly logger = new Logger(ComplianceEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /** Idempotent raise. Returns the existing event when the fact already has one. */
  async raise(draft: {
    type: ComplianceEventType;
    severity: ComplianceEventSeverity;
    title: string;
    details?: string;
    claimId?: string | null;
    adjusterId?: string | null;
    dedupeKey?: string;
    source: string;
    raisedByUserId?: string | null;
  }) {
    if (draft.dedupeKey) {
      const existing = await this.prisma.complianceEvent.findUnique({
        where: { dedupeKey: draft.dedupeKey },
      });
      if (existing) return existing;
    }

    try {
      const event = await this.prisma.complianceEvent.create({
        data: {
          type: draft.type,
          severity: draft.severity,
          title: draft.title,
          details: draft.details,
          claimId: draft.claimId ?? undefined,
          adjusterId: draft.adjusterId ?? undefined,
          dedupeKey: draft.dedupeKey,
          source: draft.source,
          raisedByUserId: draft.raisedByUserId ?? undefined,
        },
      });

      await this.audit.record({
        entityType: 'COMPLIANCE_EVENT',
        entityId: event.id,
        action: 'COMPLIANCE_EVENT_RAISED',
        actorId: draft.raisedByUserId ?? null,
        newValues: { type: draft.type, severity: draft.severity, title: draft.title },
      });
      this.logger.warn(`Compliance event raised (${draft.severity}): ${draft.title}`);
      return event;
    } catch (error) {
      // Two raisers racing on the same fact: adopt the winner's event.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.complianceEvent.findUnique({ where: { dedupeKey: draft.dedupeKey! } });
      }
      throw error;
    }
  }

  /** Fail-soft variant for system callers — the raising control must survive. */
  async raiseQuietly(draft: Parameters<ComplianceEventsService['raise']>[0]) {
    try {
      return await this.raise(draft);
    } catch (error) {
      this.logger.error(
        `COMPLIANCE EVENT NOT RAISED: ${draft.title} — the 11.2(d) register is now incomplete`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  async list(status?: ComplianceEventStatus) {
    return this.prisma.complianceEvent.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async acknowledge(id: string, tenantContext: TenantContext) {
    const event = await this.load(id);
    if (event.status !== ComplianceEventStatus.OPEN) {
      throw new BadRequestException(`Only an OPEN event can be acknowledged; this one is ${event.status}.`);
    }
    const updated = await this.prisma.complianceEvent.update({
      where: { id },
      data: {
        status: ComplianceEventStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedByUserId: tenantContext.userId,
      },
    });
    await this.audit.record({
      entityType: 'COMPLIANCE_EVENT',
      entityId: id,
      action: 'COMPLIANCE_EVENT_ACKNOWLEDGED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
    });
    return updated;
  }

  async resolve(id: string, note: string, tenantContext: TenantContext) {
    if (!note?.trim()) {
      throw new BadRequestException(
        'A resolution note is required — how the issue was dealt with is what the Board reads.'
      );
    }
    const event = await this.load(id);
    if (event.status === ComplianceEventStatus.RESOLVED) {
      throw new BadRequestException('This event is already resolved.');
    }
    const updated = await this.prisma.complianceEvent.update({
      where: { id },
      data: {
        status: ComplianceEventStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedByUserId: tenantContext.userId,
        resolutionNote: note,
      },
    });
    await this.audit.record({
      entityType: 'COMPLIANCE_EVENT',
      entityId: id,
      action: 'COMPLIANCE_EVENT_RESOLVED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { resolutionNote: note },
    });
    return updated;
  }

  /**
   * The Board report: everything not yet reported, summarised and stamped.
   *
   * Stamping `boardReportedAt` is the 11.2(d) act — after this, "was the Board
   * told" has a date for an answer. The report itself is returned for the pack;
   * generating it is audited with the counts.
   */
  async boardReport(tenantContext: TenantContext) {
    const events = await this.prisma.complianceEvent.findMany({
      where: { boardReportedAt: null },
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
    });

    const reportedAt = new Date();
    if (events.length) {
      await this.prisma.complianceEvent.updateMany({
        where: { id: { in: events.map(event => event.id) } },
        data: { boardReportedAt: reportedAt },
      });
    }

    const bySeverity: Record<string, number> = {};
    for (const event of events) {
      bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
    }

    await this.audit.record({
      entityType: 'COMPLIANCE_EVENT',
      entityId: 'board-report',
      action: 'BOARD_REPORT_GENERATED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { reportedAt, eventCount: events.length, bySeverity },
    });

    return {
      reportedAt,
      eventCount: events.length,
      bySeverity,
      openCount: events.filter(event => event.status === ComplianceEventStatus.OPEN).length,
      events,
    };
  }

  private async load(id: string) {
    const event = await this.prisma.complianceEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Compliance event not found');
    return event;
  }
}
