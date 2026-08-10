import { Body, Controller, Post, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { RetentionService } from './retention.service';

@ApiTags('retention')
@Controller({ path: 'retention', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class RetentionController {
  constructor(private readonly service: RetentionService) {}

  @Post('claims/:claimId/legal-hold')
  @ApiOperation({ summary: 'Place a legal hold — suspends purging regardless of retention' })
  // A hold is a compliance instrument, not day-to-day operations.
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.SIU_INVESTIGATOR, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  place(
    @Param('claimId') claimId: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.placeLegalHold(claimId, reason, tenantContext);
  }

  @Post('claims/:claimId/legal-hold/lift')
  @ApiOperation({ summary: 'Lift a legal hold; a reason is required and audited' })
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  lift(
    @Param('claimId') claimId: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.liftLegalHold(claimId, reason, tenantContext);
  }
}
