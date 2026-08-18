import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsentChannel, ConsentPurpose } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { ConsentService } from './consent.service';

/**
 * Claimants act on their own record only (enforced per-route below); staff see
 * the firm's. Compliance officers are included because consent standing is
 * theirs to audit.
 */
const CONSENT_ROLES = [
  UserRole.CLAIMANT,
  UserRole.ADJUSTER,
  UserRole.FIRM_ADMIN,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.SUPER_ADMIN,
] as const;

@ApiTags('consent')
@Controller({ path: 'consent', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  /**
   * Service-to-service consent check.
   *
   * TenantScope.NONE because the caller is another internal service acting for
   * the platform, not a tenant user — but still behind InternalAuthGuard, so
   * the shared key is required. Returns only a boolean: the caller learns
   * whether processing may proceed, nothing about the consent record itself.
   */
  @Get('check')
  @ApiOperation({ summary: 'Internal: is there a live consent for this claimant and purpose?' })
  @TenantIsolation(TenantScope.NONE)
  async check(
    @Query('claimantId') claimantId: string,
    @Query('purpose') purpose: ConsentPurpose
  ) {
    return { granted: await this.service.hasConsent(claimantId, purpose) };
  }

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

  /**
   * A claimant may only ever act on their own record.
   *
   * These routes carried no `@Roles`, and RolesGuard treats missing metadata as
   * allow-all — which was harmless while nothing outside the firm could reach
   * them, and became a hole the moment the claimant app needed to grant its own
   * consent. Without this check a claimant could grant, read or withdraw
   * consent for any other claimant by changing the id in the URL.
   */
  private assertOwnRecord(claimantId: string, tenantContext: TenantContext) {
    if (tenantContext.userRole === 'CLAIMANT' && tenantContext.userId !== claimantId) {
      // Absence, not refusal: to this claimant no other claimant exists, and a
      // 403 would have confirmed which ids do.
      throw new NotFoundException('Not found');
    }
  }

  @Get('claimant/:claimantId')
  @Roles(...CONSENT_ROLES)
  @ApiOperation({ summary: 'Consent record for a claimant, current and withdrawn' })
  forClaimant(@Param('claimantId') claimantId: string, @Tenant() tenantContext: TenantContext) {
    this.assertOwnRecord(claimantId, tenantContext);
    return this.service.forClaimant(claimantId);
  }

  @Post('claimant/:claimantId/grant')
  @Roles(...CONSENT_ROLES)
  @ApiOperation({ summary: 'Record consent against the approved notice' })
  grant(
    @Param('claimantId') claimantId: string,
    @Body() body: { purpose: ConsentPurpose; locale?: string; capturedVia?: ConsentChannel },
    @Tenant() tenantContext: TenantContext
  ) {
    this.assertOwnRecord(claimantId, tenantContext);
    return this.service.grant({
      claimantId,
      purpose: body.purpose,
      locale: body.locale,
      capturedVia: body.capturedVia,
      // A claimant granting their own consent is the subject, not a capturer.
      // Recording them as capturedByUserId would read as staff-captured.
      capturedByUserId:
        tenantContext.userRole === 'CLAIMANT' ? null : tenantContext.userId,
    });
  }

  @Post('claimant/:claimantId/withdraw')
  @Roles(...CONSENT_ROLES)
  @ApiOperation({ summary: 'Withdraw consent; the original grant is retained' })
  withdraw(
    @Param('claimantId') claimantId: string,
    @Body() body: { purpose: ConsentPurpose; reason?: string }
  ) {
    return this.service.withdraw(claimantId, body.purpose, body.reason);
  }
}
