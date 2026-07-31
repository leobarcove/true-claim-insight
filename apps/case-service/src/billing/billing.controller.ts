import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller({ path: 'billing', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Post('scales/:insurerTenantId')
  @ApiOperation({ summary: 'Set the insurer\'s fee scale — rates are config, never code' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  setScale(
    @Param('insurerTenantId') insurerTenantId: string,
    @Body() body: { basis: 'SCALE' | 'TIME' | 'FIXED'; bands?: unknown; hourlyRate?: number; fixedFee?: number; sstRate?: number; paymentTermsDays?: number },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.setScale(insurerTenantId, body, tenantContext);
  }

  @Post('claims/:claimId/time')
  @ApiOperation({ summary: 'Record time on a claim' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  recordTime(
    @Param('claimId') claimId: string,
    @Body() body: { workedOn: string; hours: number; description: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.recordTime(claimId, body, tenantContext);
  }

  @Post('claims/:claimId/disbursements')
  @ApiOperation({ summary: 'Record a disbursement' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  recordDisbursement(
    @Param('claimId') claimId: string,
    @Body() body: { description: string; amount: number; incurredAt: string; evidenceUrl?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.recordDisbursement(claimId, body, tenantContext);
  }

  @Post('claims/:claimId/fee-note')
  @ApiOperation({ summary: 'Draft the fee note from the claim\'s records and the insurer\'s scale' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  draft(@Param('claimId') claimId: string, @Tenant() tenantContext: TenantContext) {
    return this.service.draftFeeNote(claimId, tenantContext);
  }

  @Post('fee-notes/:id/issue')
  @ApiOperation({ summary: 'Issue to the insurer; due per the scale\'s payment terms' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  issue(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.issue(id, tenantContext);
  }

  @Post('fee-notes/:id/paid')
  @ApiOperation({ summary: 'Record settlement; the payment reference is the proof' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  markPaid(
    @Param('id') id: string,
    @Body('reference') reference: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.markPaid(id, reference, tenantContext);
  }

  @Post('fee-notes/:id/dispute')
  @ApiOperation({ summary: 'Record the insurer\'s dispute' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  dispute(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.dispute(id, reason, tenantContext);
  }

  @Get('statement')
  @ApiOperation({ summary: 'Outstanding fee notes per insurer, aged — the CSP 11.16–11.18 evidence' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  statement() {
    return this.service.insurerStatement();
  }
}
