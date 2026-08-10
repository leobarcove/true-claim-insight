import { Body, Controller, Get, Param, Post, Patch, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdjusterReportType, QualityRating } from '@prisma/client';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { QualityReviewService } from './quality-review.service';
import { ReportsService } from './reports.service';
import type { ReportSections } from './report-templates';

/**
 * Adjuster reports.
 *
 * Authorisation is intentionally not expressed with role decorators alone: PD
 * 12.7 restricts authorship and sign-off to *adjusting employees*, which is a
 * property of having an Adjuster profile, not of holding a role. The service
 * enforces that, so a FIRM_ADMIN who is not an adjusting employee is refused.
 */
@ApiTags('adjuster-reports')
@Controller({ path: 'reports', version: '1' })
// InternalAuthGuard first: it validates the shared service key and turns the
// gateway's identity headers into request.user, which TenantGuard then reads.
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly quality: QualityReviewService
  ) {}

  @Get('template')
  @ApiOperation({ summary: 'Section template for a report type (headings, guidance, PD basis)' })
  template(@Query('type') type: AdjusterReportType) {
    return this.service.template(type);
  }

  @Get('claim/:claimId')
  @ApiOperation({ summary: 'All reports on a claim, newest version first' })
  forClaim(@Param('claimId') claimId: string) {
    return this.service.forClaim(claimId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One report' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Render the report as a PDF (drafts render watermarked)' })
  async pdf(@Param('id') id: string, @Res() reply: FastifyReply) {
    const { filename, pdf } = await this.service.render(id);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(pdf);
  }

  @Post('claim/:claimId')
  @ApiOperation({ summary: 'Open a report on a claim (adjusting employees only)' })
  create(
    @Param('claimId') claimId: string,
    @Body('type') type: AdjusterReportType,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.create(claimId, type, tenantContext);
  }

  @Patch(':id/sections')
  @ApiOperation({ summary: 'Write section content (author only, draft only)' })
  updateSections(
    @Param('id') id: string,
    @Body('sections') sections: ReportSections,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.updateSections(id, sections, tenantContext);
  }

  @Post(':id/refresh-quantum')
  @ApiOperation({ summary: 'Pull the current quantum worksheet into a draft report' })
  refreshQuantum(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.refreshQuantum(id, tenantContext);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit for sign-off; refused while PD 12.6 sections are empty' })
  submit(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.submitForReview(id, tenantContext);
  }

  @Post(':id/return')
  @ApiOperation({ summary: 'Send a submitted report back to its author' })
  returnToAuthor(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.returnToAuthor(id, reason, tenantContext);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Sign the report (PD 12.7 countersign rules apply)' })
  sign(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.sign(id, tenantContext);
  }

  @Post(':id/issue')
  @ApiOperation({ summary: 'Issue to the insurer; stops the matching SLA clock' })
  issue(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.issue(id, tenantContext);
  }

  @Post(':id/supersede')
  @ApiOperation({ summary: 'Open a correction that supersedes an issued report' })
  supersede(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.supersede(id, tenantContext);
  }

  @Post(':id/quality-review')
  @ApiOperation({ summary: 'Work-quality review of an issued report (PD 11.2(b))' })
  qualityReview(
    @Param('id') id: string,
    @Body() body: { rating: QualityRating; findings?: string; notes?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.quality.review(id, body, tenantContext);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: 'Withdraw a report that has not been issued' })
  withdraw(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.withdraw(id, reason, tenantContext);
  }
}
