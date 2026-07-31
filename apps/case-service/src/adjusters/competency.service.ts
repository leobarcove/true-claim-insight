import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClaimCategory } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { canRecogniseSenior } from './adjuster-competency';

/**
 * Competency records and the acts that change an adjuster's standing.
 *
 * Two acts here are compliance decisions, not data entry, and both are audited
 * with a named actor: recognising a senior (PD 12.4 — the firm's judgement on
 * volume and performance, floored at five years) and verifying a licence
 * (activating `licenseVerifiedAt`, which had been a dead column asserting a
 * verification nobody performed — §3.6 item 6).
 */
@Injectable()
export class CompetencyService {
  private readonly logger = new Logger(CompetencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private async requireAdjuster(adjusterId: string) {
    const adjuster = await this.prisma.adjuster.findUnique({ where: { id: adjusterId } });
    if (!adjuster) throw new NotFoundException('Adjuster not found');
    return adjuster;
  }

  async list(adjusterId: string) {
    await this.requireAdjuster(adjusterId);
    return this.prisma.adjusterCompetency.findMany({
      where: { adjusterId },
      orderBy: { category: 'asc' },
    });
  }

  /**
   * Record or update competency in one subject.
   *
   * Deliberately cannot set recognition: years, cases and performance are data,
   * but senior status is a separate, gated act below. An update that lowers the
   * years below the floor while recognition stands revokes the recognition —
   * standing derived from stale inputs is the false-comfort pattern.
   */
  async upsert(
    adjusterId: string,
    category: ClaimCategory,
    data: { yearsInSubject: number; casesHandled?: number; performanceSatisfactory?: boolean; notes?: string },
    tenantContext: TenantContext
  ) {
    await this.requireAdjuster(adjusterId);
    if (!Number.isInteger(data.yearsInSubject) || data.yearsInSubject < 0) {
      throw new BadRequestException('yearsInSubject must be a non-negative integer');
    }

    const existing = await this.prisma.adjusterCompetency.findUnique({
      where: { adjusterId_category: { adjusterId, category } },
    });

    const revokesRecognition =
      Boolean(existing?.seniorRecognisedAt) && data.yearsInSubject < 5;

    const competency = await this.prisma.adjusterCompetency.upsert({
      where: { adjusterId_category: { adjusterId, category } },
      update: {
        yearsInSubject: data.yearsInSubject,
        casesHandled: data.casesHandled ?? existing?.casesHandled ?? 0,
        performanceSatisfactory:
          data.performanceSatisfactory ?? existing?.performanceSatisfactory ?? false,
        notes: data.notes,
        ...(revokesRecognition ? { seniorRecognisedAt: null, seniorRecognisedByUserId: null } : {}),
      },
      create: {
        adjusterId,
        category,
        yearsInSubject: data.yearsInSubject,
        casesHandled: data.casesHandled ?? 0,
        performanceSatisfactory: data.performanceSatisfactory ?? false,
        notes: data.notes,
      },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: adjusterId,
      action: 'COMPETENCY_RECORDED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      oldValues: existing
        ? { yearsInSubject: existing.yearsInSubject, casesHandled: existing.casesHandled }
        : undefined,
      newValues: {
        category,
        yearsInSubject: data.yearsInSubject,
        ...(revokesRecognition ? { seniorRecognitionRevoked: true } : {}),
      },
    });

    if (revokesRecognition) {
      this.logger.warn(
        `Senior recognition revoked for adjuster ${adjusterId} in ${category}: ` +
          'years fell below the PD 12.4(a) floor'
      );
    }
    return competency;
  }

  /** The PD 12.4 recognition act. Refuses when the floor or considerations fail. */
  async recogniseSenior(adjusterId: string, category: ClaimCategory, tenantContext: TenantContext) {
    await this.requireAdjuster(adjusterId);
    const competency = await this.prisma.adjusterCompetency.findUnique({
      where: { adjusterId_category: { adjusterId, category } },
    });
    if (!competency) {
      throw new BadRequestException(
        'No competency record exists for this category. Record the years, cases and ' +
          'performance first — recognition weighs them (PD 12.4(b)).'
      );
    }

    const decision = canRecogniseSenior(competency);
    if (!decision.allowed) throw new BadRequestException(decision.reason);

    const recognised = await this.prisma.adjusterCompetency.update({
      where: { adjusterId_category: { adjusterId, category } },
      data: { seniorRecognisedAt: new Date(), seniorRecognisedByUserId: tenantContext.userId },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: adjusterId,
      action: 'SENIOR_RECOGNISED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: {
        category,
        yearsInSubject: competency.yearsInSubject,
        casesHandled: competency.casesHandled,
      },
    });
    return recognised;
  }

  /**
   * Record that the firm verified this adjuster's licence.
   *
   * `licenseVerifiedAt` existed from the start with zero writers — a column
   * asserting a verification nobody performed. It now records an act by a named
   * person, and registered-mode assignment requires it.
   */
  async verifyLicence(adjusterId: string, tenantContext: TenantContext) {
    const adjuster = await this.requireAdjuster(adjusterId);

    const verified = await this.prisma.adjuster.update({
      where: { id: adjusterId },
      data: { licenseVerifiedAt: new Date() },
    });

    await this.audit.record({
      entityType: 'ADJUSTER',
      entityId: adjusterId,
      action: 'LICENCE_VERIFIED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { licenseNumber: adjuster.licenseNumber },
    });
    return verified;
  }
}
