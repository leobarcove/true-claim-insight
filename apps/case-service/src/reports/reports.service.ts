import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdjusterReportStatus, AdjusterReportType, Prisma, SlaStage } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { SlaService } from '../sla/sla.service';
import { isLicensedMode } from '../tenant/tenant-settings';
import {
  aiAssistedSections,
  missingMandatorySections,
  templateFor,
  type ReportSections,
} from './report-templates';
import { underSupervision } from '../adjusters/adjuster-competency';
import { ConflictsService } from '../adjusters/conflicts.service';
import { canSign, canTransition, countersignDecision, type AdjusterStanding } from './report-authority';
import { ReportPdfGenerator } from './report-pdf.generator';

/** Which SLA stage a report type discharges when issued. */
const STAGE_FOR_TYPE: Partial<Record<AdjusterReportType, SlaStage>> = {
  [AdjusterReportType.PRELIMINARY]: SlaStage.PRELIMINARY_REPORT,
  [AdjusterReportType.FINAL]: SlaStage.FINAL_REPORT,
  [AdjusterReportType.SUPPLEMENTARY]: SlaStage.SUPPLEMENTARY_CLAIM,
};

/**
 * Adjuster reports — creation, authorship, sign-off and issue.
 *
 * This is the firm's work product and, in a BNM examination, its primary
 * evidence. The controls that matter are enforced here on the server, never in
 * the portal: authorship restricted to adjusting employees (PD 12.7), the PD 12.6
 * disclosure sections required before sign-off, and issued reports immutable so
 * what the insurer was told stays recoverable.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    private readonly conflicts: ConflictsService
  ) {}

  /** The Adjuster record for a user, or null when they are not one. */
  private async adjusterFor(userId: string) {
    return this.prisma.adjuster.findFirst({ where: { userId } });
  }

  /**
   * Real standing from the competency model: years and recognition in the
   * claim's own category (PD 12.4 is subject-specific), plus the PD 12.3
   * supervision window. An adjuster with no competency record in this category
   * reads as junior — the same safe default as before the model existed.
   */
  private async standing(
    adjuster: { id: string; status: string; adjustingSince: Date | null },
    category: string | null | undefined
  ): Promise<AdjusterStanding> {
    const competency = category
      ? await this.prisma.adjusterCompetency.findUnique({
          where: { adjusterId_category: { adjusterId: adjuster.id, category: category as never } },
        })
      : null;

    return {
      id: adjuster.id,
      status: adjuster.status,
      yearsInSubject: competency?.yearsInSubject,
      seniorRecognised: competency ? Boolean(competency.seniorRecognisedAt) : undefined,
      underSupervision: underSupervision(adjuster.adjustingSince, new Date()),
    };
  }

  private async licensedModeFor(tenantId: string | null | undefined): Promise<boolean> {
    if (!tenantId) return false;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return isLicensedMode(tenant?.settings);
  }

  /**
   * The adjusting employee acting, or a refusal.
   *
   * PD 12.7 is the reason this is not simply "the logged-in user": a firm admin
   * or support user may be perfectly senior in the organisation and still not be
   * an adjusting employee, and only adjusting employees may author or sign.
   */
  private async requireAdjuster(tenantContext: TenantContext) {
    const adjuster = await this.adjusterFor(tenantContext.userId);
    if (!adjuster) {
      throw new ForbiddenException(
        'Only an adjusting employee may author or sign an adjuster report (PD 12.7). ' +
          'This account has no adjuster profile.'
      );
    }
    return adjuster;
  }

  private async loadClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  /** Start a report. The template's sections are pre-created empty with guidance. */
  async create(
    claimId: string,
    type: AdjusterReportType,
    tenantContext: TenantContext
  ) {
    const claim = await this.loadClaim(claimId);
    const author = await this.requireAdjuster(tenantContext);

    const sections: ReportSections = Object.fromEntries(
      templateFor(type).map(section => [section.key, { body: '' }])
    );

    try {
      const report = await this.prisma.adjusterReport.create({
        data: {
          claimId,
          type,
          sections: sections as unknown as Prisma.InputJsonValue,
          authorAdjusterId: author.id,
        },
      });
      this.logger.log(`${type} report opened on claim ${claim.claimNumber} by adjuster ${author.id}`);
      return report;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(
          `A ${type} report is already in progress on this claim. Finish or withdraw it before starting another.`
        );
      }
      throw error;
    }
  }

  private async loadEditable(reportId: string) {
    const report = await this.prisma.adjusterReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  /**
   * Write section content.
   *
   * Only the author may edit, and only while the report is a draft or has been
   * sent back. An issued report is never edited — that is what supersession is
   * for.
   */
  async updateSections(
    reportId: string,
    updates: ReportSections,
    tenantContext: TenantContext
  ) {
    const report = await this.loadEditable(reportId);
    const adjuster = await this.requireAdjuster(tenantContext);

    if (report.status !== AdjusterReportStatus.DRAFT) {
      throw new BadRequestException(
        `A report can only be edited while in DRAFT; this one is ${report.status}. ` +
          (report.status === AdjusterReportStatus.ISSUED
            ? 'Issue a superseding report instead — an issued report is part of the record.'
            : 'Return it to draft first.')
      );
    }

    if (report.authorAdjusterId !== adjuster.id) {
      throw new ForbiddenException('Only the report author may edit its content (PD 12.7).');
    }

    const known = new Set(templateFor(report.type).map(section => section.key));
    const unknown = Object.keys(updates).filter(key => !known.has(key));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown section(s) for a ${report.type} report: ${unknown.join(', ')}`
      );
    }

    const merged: ReportSections = {
      ...((report.sections as unknown as ReportSections) ?? {}),
      ...updates,
    };

    return this.prisma.adjusterReport.update({
      where: { id: reportId },
      data: { sections: merged as unknown as Prisma.InputJsonValue },
    });
  }

  /** Submit for sign-off. Refuses while PD 12.6 disclosures are incomplete. */
  async submitForReview(reportId: string, tenantContext: TenantContext) {
    const report = await this.loadEditable(reportId);
    const adjuster = await this.requireAdjuster(tenantContext);

    if (report.authorAdjusterId !== adjuster.id) {
      throw new ForbiddenException('Only the report author may submit it for review.');
    }
    this.assertTransition(report.status, AdjusterReportStatus.IN_REVIEW);

    const missing = missingMandatorySections(
      report.type,
      (report.sections as unknown as ReportSections) ?? {}
    );
    if (missing.length) {
      throw new BadRequestException(
        `Cannot submit while required sections are empty: ${missing.join(', ')}. ` +
          'PD 12.6 requires the facts, assumptions, methods and sources to be disclosed.'
      );
    }

    // PD 12.1(d): the per-claim COI attestation. Registered mode requires it
    // before a report leaves the author's hands; as a TPA the gap is logged so
    // the habit forms before the flag flips.
    const claim = await this.loadClaim(report.claimId);
    const attested = await this.conflicts.hasClearAttestation(report.claimId, adjuster.id);
    if (!attested) {
      if (await this.licensedModeFor(claim.tenantId)) {
        throw new BadRequestException(
          'Submit refused: attest the conflict-of-interest position for this claim first ' +
            '(PD 12.1(d)). POST /claims/:id/coi-attestation.'
        );
      }
      this.logger.warn(
        `Report ${reportId} submitted without a COI attestation (advisory while TPA)`
      );
    }

    return this.prisma.adjusterReport.update({
      where: { id: reportId },
      data: { status: AdjusterReportStatus.IN_REVIEW, submittedAt: new Date() },
    });
  }

  /** Send a submitted report back to its author. */
  async returnToAuthor(reportId: string, reason: string, tenantContext: TenantContext) {
    const report = await this.loadEditable(reportId);
    await this.requireAdjuster(tenantContext);
    this.assertTransition(report.status, AdjusterReportStatus.DRAFT);

    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required when returning a report to its author.');
    }

    const metadata = (report.metadata as Record<string, unknown>) ?? {};
    return this.prisma.adjusterReport.update({
      where: { id: reportId },
      data: {
        status: AdjusterReportStatus.DRAFT,
        submittedAt: null,
        metadata: {
          ...metadata,
          returnedAt: new Date().toISOString(),
          returnReason: reason,
        } as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Sign the report.
   *
   * The countersign decision is persisted whether or not it blocked, so the
   * record shows the basis on which a signature was accepted. In TPA mode an
   * unmet countersign is recorded and allowed; on registration the same check
   * blocks. That is the licence flip working as designed, not a loophole.
   */
  async sign(reportId: string, tenantContext: TenantContext) {
    const report = await this.loadEditable(reportId);
    const signer = await this.requireAdjuster(tenantContext);
    this.assertTransition(report.status, AdjusterReportStatus.SIGNED);

    const author = await this.prisma.adjuster.findUnique({
      where: { id: report.authorAdjusterId },
    });
    if (!author) throw new NotFoundException('Report author no longer exists');

    const claim = await this.loadClaim(report.claimId);
    const licensedMode = await this.licensedModeFor(claim.tenantId);
    const missingSections = missingMandatorySections(
      report.type,
      (report.sections as unknown as ReportSections) ?? {}
    );

    const params = {
      type: report.type,
      author: await this.standing(author, claim.category),
      signer: await this.standing(signer, claim.category),
      licensedMode,
      missingSections,
    };

    const eligibility = canSign(params);
    if (!eligibility.allowed) {
      throw new BadRequestException(eligibility.reason);
    }

    const countersign = countersignDecision(params);
    if (countersign.required && !countersign.satisfied) {
      this.logger.warn(
        `Report ${reportId} signed without the countersign PD 12.7(b) expects — ` +
          `advisory in TPA mode, blocking once licensedMode is on. Basis: ${countersign.basis}`
      );
    }

    return this.prisma.adjusterReport.update({
      where: { id: reportId },
      data: {
        status: AdjusterReportStatus.SIGNED,
        signedByAdjusterId: signer.id,
        signedAt: new Date(),
        countersignBasis: countersign.basis,
      },
    });
  }

  /**
   * Issue the report to the insurer.
   *
   * This is the point the firm's turnaround obligation is discharged, so the
   * matching SLA clock stops here rather than on a claim status change — issuing
   * the report is the act CSP measures.
   */
  async issue(reportId: string, tenantContext: TenantContext) {
    const report = await this.loadEditable(reportId);
    await this.requireAdjuster(tenantContext);
    this.assertTransition(report.status, AdjusterReportStatus.ISSUED);

    const issued = await this.prisma.adjusterReport.update({
      where: { id: reportId },
      data: { status: AdjusterReportStatus.ISSUED, issuedAt: new Date() },
    });

    const stage = STAGE_FOR_TYPE[report.type];
    if (stage) {
      await this.sla.runQuietly(`stop ${stage} on report issue`, () =>
        this.sla.stop(report.claimId, stage)
      );
    }

    const aiSections = aiAssistedSections((report.sections as unknown as ReportSections) ?? {});
    this.logger.log(
      `${report.type} report issued on claim ${report.claimId}` +
        (aiSections.length ? `; AI-assisted sections disclosed: ${aiSections.join(', ')}` : '')
    );

    return issued;
  }

  /**
   * Open a correction that supersedes an issued report.
   *
   * The previous report stays exactly as issued. A regulator asking what the
   * insurer was told, and when, must be able to see both.
   */
  async supersede(reportId: string, tenantContext: TenantContext) {
    const previous = await this.loadEditable(reportId);
    const author = await this.requireAdjuster(tenantContext);

    if (previous.status !== AdjusterReportStatus.ISSUED) {
      throw new BadRequestException(
        'Only an issued report can be superseded. Edit or withdraw one that has not been issued.'
      );
    }

    return this.prisma.adjusterReport.create({
      data: {
        claimId: previous.claimId,
        type: previous.type,
        version: previous.version + 1,
        supersedesId: previous.id,
        sections: previous.sections as Prisma.InputJsonValue,
        authorAdjusterId: author.id,
      },
    });
  }

  /** Withdraw a report that has not been issued. */
  async withdraw(reportId: string, reason: string, tenantContext: TenantContext) {
    const report = await this.loadEditable(reportId);
    await this.requireAdjuster(tenantContext);
    this.assertTransition(report.status, AdjusterReportStatus.WITHDRAWN);

    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to withdraw a report.');
    }

    return this.prisma.adjusterReport.update({
      where: { id: reportId },
      data: {
        status: AdjusterReportStatus.WITHDRAWN,
        withdrawnAt: new Date(),
        withdrawnReason: reason,
      },
    });
  }

  async forClaim(claimId: string) {
    return this.prisma.adjusterReport.findMany({
      where: { claimId },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      include: {
        author: { include: { user: { select: { fullName: true } } } },
        signedBy: { include: { user: { select: { fullName: true } } } },
      },
    });
  }

  async findOne(reportId: string) {
    const report = await this.prisma.adjusterReport.findUnique({
      where: { id: reportId },
      include: {
        claim: { select: { claimNumber: true, policyNumber: true, tenantId: true } },
        author: { include: { user: { select: { fullName: true } } } },
        signedBy: { include: { user: { select: { fullName: true } } } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  /**
   * Render the report as a PDF.
   *
   * Available at any status: an unissued report renders watermarked so a draft
   * cannot be mistaken for something sent to the insurer.
   */
  async render(reportId: string): Promise<{ filename: string; pdf: Buffer }> {
    const report = await this.findOne(reportId);
    const tenant = report.claim.tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: report.claim.tenantId } })
      : null;

    const identity = (adjuster: typeof report.author | null | undefined) =>
      adjuster
        ? { fullName: adjuster.user.fullName ?? 'Unnamed adjuster', licenceNumber: adjuster.licenseNumber }
        : null;

    const pdf = await new ReportPdfGenerator().generate({
      report: {
        type: report.type,
        status: report.status,
        version: report.version,
        sections: (report.sections as unknown as ReportSections) ?? {},
        issuedAt: report.issuedAt,
        signedAt: report.signedAt,
        countersignBasis: report.countersignBasis,
        supersedesId: report.supersedesId,
      },
      claim: { claimNumber: report.claim.claimNumber, policyNumber: report.claim.policyNumber },
      author: identity(report.author)!,
      signedBy: identity(report.signedBy),
      firmName: tenant?.name ?? 'Adjusting firm',
    });

    return {
      filename: `${report.claim.claimNumber}-${report.type.toLowerCase()}-v${report.version}.pdf`,
      pdf,
    };
  }

  /** The template, so the portal renders headings and guidance from one source. */
  template(type: AdjusterReportType) {
    return templateFor(type);
  }

  private assertTransition(from: AdjusterReportStatus, to: AdjusterReportStatus) {
    if (!canTransition(from, to)) {
      throw new BadRequestException(`A report cannot move from ${from} to ${to}.`);
    }
  }
}
