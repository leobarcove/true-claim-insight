import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsentChannel, ConsentPurpose } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { ConsentService } from './consent.service';

@ApiTags('consent')
@Controller({ path: 'consent', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get('notice')
  @ApiOperation({ summary: 'Current approved notice for a purpose and locale' })
  notice(@Query('purpose') purpose: ConsentPurpose, @Query('locale') locale = 'en') {
    return this.service.currentNotice(purpose, locale);
  }

  @Get('pending-approval')
  @ApiOperation({ summary: 'Notice versions still awaiting approval' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  pending() {
    return this.service.pendingApproval();
  }

  @Post('notice/:purpose/:version/approve')
  @ApiOperation({ summary: 'Approve a notice version (refused unless EN and BM both exist)' })
  // Approving consent wording is a compliance act, not an operational one.
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  approve(
    @Param('purpose') purpose: ConsentPurpose,
    @Param('version') version: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.approveNotice(purpose, Number(version), tenantContext.userId);
  }

  @Get('claimant/:claimantId')
  @ApiOperation({ summary: 'Consent record for a claimant, current and withdrawn' })
  forClaimant(@Param('claimantId') claimantId: string) {
    return this.service.forClaimant(claimantId);
  }

  @Post('claimant/:claimantId/grant')
  @ApiOperation({ summary: 'Record consent against the approved notice' })
  grant(
    @Param('claimantId') claimantId: string,
    @Body() body: { purpose: ConsentPurpose; locale?: string; capturedVia?: ConsentChannel },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.grant({
      claimantId,
      purpose: body.purpose,
      locale: body.locale,
      capturedVia: body.capturedVia,
      capturedByUserId: tenantContext.userId,
    });
  }

  @Post('claimant/:claimantId/withdraw')
  @ApiOperation({ summary: 'Withdraw consent; the original grant is retained' })
  withdraw(
    @Param('claimantId') claimantId: string,
    @Body() body: { purpose: ConsentPurpose; reason?: string }
  ) {
    return this.service.withdraw(claimantId, body.purpose, body.reason);
  }
}
