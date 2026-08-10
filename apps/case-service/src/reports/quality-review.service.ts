import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdjusterReportStatus, QualityRating } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';

/**
 * Work-quality reviews on issued reports (PD 11.2(b)) — the evidence behind
 * the `performanceSatisfactory` attestation in senior recognition (12.4(b)(ii)).
 *
 * Only issued reports are reviewable: quality review judges the work product
 * the insurer received, not a draft that may still change. A rating below
 * SATISFACTORY requires the findings described — the finding is the value.
 */
@Injectable()
export class QualityReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async review(
    reportId: string,
    data: { rating: QualityRating; findings?: string; notes?: string },
    tenantContext: TenantContext
  ) {
    const report = await this.prisma.adjusterReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== AdjusterReportStatus.ISSUED) {
      throw new BadRequestException(
        'Only an issued report can be quality-reviewed — the review judges what the insurer received.'
      );
    }
    if (data.rating !== QualityRating.SATISFACTORY && !data.findings?.trim()) {
      throw new BadRequestException(
        `A ${data.rating} rating requires the findings described.`
      );
    }
    // A reviewer reviewing their own authorship is not a review.
    const reviewerAdjuster = await this.prisma.adjuster.findFirst({
      where: { userId: tenantContext.userId },
    });
    if (reviewerAdjuster && reviewerAdjuster.id === report.authorAdjusterId) {
      throw new BadRequestException('The author cannot quality-review their own report.');
    }

    const review = await this.prisma.workQualityReview.upsert({
      where: { reportId_reviewerUserId: { reportId, reviewerUserId: tenantContext.userId } },
      update: { rating: data.rating, findings: data.findings, notes: data.notes, reviewedAt: new Date() },
      create: {
        reportId,
        adjusterId: report.authorAdjusterId,
        rating: data.rating,
        findings: data.findings,
        notes: data.notes,
        reviewerUserId: tenantContext.userId,
      },
    });

    await this.audit.record({
      entityType: 'ADJUSTER_REPORT',
      entityId: reportId,
      action: 'QUALITY_REVIEWED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { rating: data.rating, adjusterId: report.authorAdjusterId },
    });
    return review;
  }

  async forAdjuster(adjusterId: string) {
    return this.prisma.workQualityReview.findMany({
      where: { adjusterId },
      orderBy: { reviewedAt: 'desc' },
    });
  }
}
