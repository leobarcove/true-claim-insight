import { Body, Controller, Get, Param, Post, Patch, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdjusterReportType, QualityRating } from '@prisma/client';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { QualityReviewService } from './quality-review.service';
import { ReportsService } from './reports.service';
import type { ReportSections } from './report-templates';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/guards/roles.guard';

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
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly quality: QualityReviewService
  ) {}

  @Get('template')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Section template for a report type (headings, guidance, PD basis)' })
  template(@Query('type') type: AdjusterReportType) {
    return this.service.template(type);
  }

  @Get('claim/:claimId')
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.SIU_INVESTIGATOR,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SHARIAH_REVIEWER,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'All reports on a claim, newest version first' })
  forClaim(@Param('claimId') claimId: string, @Tenant() tenantContext: TenantContext) {
    return this.service.forClaim(claimId, tenantContext);
  }

  @Get(':id')
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.SIU_INVESTIGATOR,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SHARIAH_REVIEWER,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'One report' })
  findOne(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.findOne(id, tenantContext);
  }

  @Get(':id/pdf')
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.SIU_INVESTIGATOR,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SHARIAH_REVIEWER,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'Render the report as a PDF (drafts render watermarked)' })
  async pdf(
    @Param('id') id: string,
    @Tenant() tenantContext: TenantContext,
    @Res() reply: FastifyReply
  ) {
    const { filename, pdf } = await this.service.render(id, tenantContext);

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(pdf);
  }

  @Post('claim/:claimId')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Open a report on a claim (adjusting employees only)' })
  create(
    @Param('claimId') claimId: string,
    @Body('type') type: AdjusterReportType,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.create(claimId, type, tenantContext);
  }

  @Patch(':id/sections')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Write section content (author only, draft only)' })
  updateSections(
    @Param('id') id: string,
    @Body('sections') sections: ReportSections,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.updateSections(id, sections, tenantContext);
  }

  @Post(':id/refresh-quantum')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Pull the current quantum worksheet into a draft report' })
  refreshQuantum(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.refreshQuantum(id, tenantContext);
  }

  @Post(':id/submit')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Submit for sign-off; refused while PD 12.6 sections are empty' })
  submit(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.submitForReview(id, tenantContext);
  }

  @Post(':id/return')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send a submitted report back to its author' })
  returnToAuthor(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.returnToAuthor(id, reason, tenantContext);
  }

  @Post(':id/sign')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Sign the report (PD 12.7 countersign rules apply)' })
  sign(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.sign(id, tenantContext);
  }

  @Post(':id/issue')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Issue to the insurer; stops the matching SLA clock' })
  issue(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.issue(id, tenantContext);
  }

  @Post(':id/supersede')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Open a correction that supersedes an issued report' })
  supersede(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.supersede(id, tenantContext);
  }

  @Post(':id/quality-review')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.COMPLIANCE_OFFICER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Work-quality review of an issued report (PD 11.2(b))' })
  qualityReview(
    @Param('id') id: string,
    @Body() body: { rating: QualityRating; findings?: string; notes?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.quality.review(id, body, tenantContext);
  }

  @Post(':id/withdraw')
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Withdraw a report that has not been issued' })
  withdraw(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.withdraw(id, reason, tenantContext);
  }
}
