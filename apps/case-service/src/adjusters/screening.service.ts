import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ScreeningCheckType, ScreeningOutcome } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { screeningStanding, type ScreeningStanding } from './background-screening';

/**
 * Background-screening records (PD 11.2(e)).
 *
 * FINDINGS is a legitimate outcome: "we found it, considered it and proceeded"
 * is the record that protects the firm — but only when the finding is
 * described, so an undescribed FINDINGS is refused. Records are append-only in
 * spirit: a wrong entry is corrected by a new record, never edited away.
 */
@Injectable()
export class ScreeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async record(
    adjusterId: string,
    data: {
      checkType: ScreeningCheckType;
      outcome: ScreeningOutcome;
      findingsNote?: string;
      screenedAt: string;
      conductedBy: string;
      evidenceUrl?: string;
    },
    tenantContext: TenantContext
  ) {
    const adjuster = await this.prisma.adjuster.findUnique({ where: { id: adjusterId } });
    if (!adjuster) throw new NotFoundException('Adjuster not found');
    if (!data.conductedBy?.trim()) {
      throw new BadRequestException('conductedBy is required — a check nobody performed is not a check.');
    }
    const screenedAt = new Date(data.screenedAt);
    if (Number.isNaN(screenedAt.getTime())) {
      throw new BadRequestException('screenedAt must be a valid date.');
    }
    if (data.outcome === ScreeningOutcome.FINDINGS && !data.findingsNote?.trim()) {
      throw new BadRequestException(
        'A FINDINGS outcome requires describing the finding. The record of what was found and ' +
          'considered is the point of the screening.'
      );
    }

    const record = await this.prisma.backgroundScreening.create({
      data: { adjusterId, ...data, screenedAt, recordedByUserId: tenantContext.userId },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: adjusterId,
      action: 'BACKGROUND_CHECK_RECORDED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: {
        checkType: data.checkType,
        outcome: data.outcome,
        conductedBy: data.conductedBy,
        screenedAt,
      },
    });
    return record;
  }

  async list(adjusterId: string) {
    return this.prisma.backgroundScreening.findMany({
      where: { adjusterId },
      orderBy: { screenedAt: 'asc' },
    });
  }

  async standing(adjusterId: string): Promise<ScreeningStanding> {
    const adjuster = await this.prisma.adjuster.findUnique({
      where: { id: adjusterId },
      include: { backgroundScreenings: true },
    });
    if (!adjuster) throw new NotFoundException('Adjuster not found');

    return screeningStanding(adjuster.backgroundScreenings, adjuster.adjustingSince);
  }
}
