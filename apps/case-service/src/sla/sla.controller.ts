import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { SlaService } from './sla.service';

@ApiTags('sla')
@Controller({ path: 'sla', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  /**
   * Every clock on one claim, newest first.
   *
   * The clocks have run since Phase 1b and nothing exposed them: a breach was
   * recorded, escalated and reported to nobody the adjuster could see. Read by
   * anyone who may see the claim — a deadline is not privileged information,
   * and hiding it from the person working the file is how it gets missed.
   */
  @Get('claims/:claimId')
  @ApiOperation({ summary: 'SLA clocks for one claim' })
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SIU_INVESTIGATOR,
    UserRole.SUPPORT_DESK,
    UserRole.SUPER_ADMIN
  )
  forClaim(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.sla.forClaim(claimId, tenantContext);
  }

  @Get('insurer-mi')
  @ApiOperation({ summary: 'Insurer-side CSP performance (decision/payment windows) per insurer' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  insurerMi() {
    return this.sla.insurerMi();
  }
}
