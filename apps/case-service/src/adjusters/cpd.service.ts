import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { cpdStanding, type CpdStanding } from './cpd-standing';

/**
 * The CPD ledger (PD 12.9–12.11). Recording is open to the adjuster and the
 * firm; *recognition* of a provider is a fact the recorder asserts and the
 * audit row attributes — the standing calculation then counts only what
 * qualifies, so an unrecognised programme can never quietly satisfy the floor.
 */
@Injectable()
export class CpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async record(
    adjusterId: string,
    data: {
      year: number;
      hours: number;
      programmeName: string;
      provider: string;
      providerRecognised?: boolean;
      completedAt: string;
      evidenceUrl?: string;
      notes?: string;
    },
    tenantContext: TenantContext
  ) {
    const adjuster = await this.prisma.adjuster.findUnique({ where: { id: adjusterId } });
    if (!adjuster) throw new NotFoundException('Adjuster not found');
    if (!data.programmeName?.trim() || !data.provider?.trim()) {
      throw new BadRequestException('Programme and provider are required.');
    }
    if (!(data.hours > 0 && data.hours <= 60)) {
      throw new BadRequestException('Hours must be between 0 and 60 per entry.');
    }
    const completedAt = new Date(data.completedAt);
    if (Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException('completedAt must be a valid date.');
    }
    if (completedAt.getUTCFullYear() !== data.year) {
      throw new BadRequestException(
        `completedAt (${completedAt.toISOString().slice(0, 10)}) is not in year ${data.year} — ` +
          'hours count toward the year they were attended.'
      );
    }

    const record = await this.prisma.cpdRecord.create({
      data: { adjusterId, ...data, completedAt, recordedByUserId: tenantContext.userId },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: adjusterId,
      action: 'CPD_RECORDED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: {
        year: data.year,
        hours: data.hours,
        programme: data.programmeName,
        providerRecognised: Boolean(data.providerRecognised),
      },
    });
    return record;
  }

  async list(adjusterId: string, year?: number) {
    return this.prisma.cpdRecord.findMany({
      where: { adjusterId, ...(year ? { year } : {}) },
      orderBy: { completedAt: 'desc' },
    });
  }

  async standing(adjusterId: string, year: number): Promise<CpdStanding> {
    const records = await this.prisma.cpdRecord.findMany({ where: { adjusterId, year } });
    return cpdStanding(
      records.map(record => ({
        year: record.year,
        hours: Number(record.hours),
        providerRecognised: record.providerRecognised,
      })),
      year,
      new Date()
    );
  }

  /** Firm-wide dashboard: every adjuster's standing for a year. */
  async firmStanding(tenantId: string, year: number) {
    const adjusters = await this.prisma.adjuster.findMany({
      where: { tenantId },
      include: { user: { select: { fullName: true } }, cpdRecords: { where: { year } } },
    });

    return adjusters.map(adjuster => ({
      adjusterId: adjuster.id,
      name: adjuster.user.fullName,
      ...cpdStanding(
        adjuster.cpdRecords.map(record => ({
          year: record.year,
          hours: Number(record.hours),
          providerRecognised: record.providerRecognised,
        })),
        year,
        new Date()
      ),
    }));
  }
}
