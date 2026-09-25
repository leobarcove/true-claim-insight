import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BnmChangeType } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { BnmNotificationsService } from './bnm-notifications.service';
import { assertAdjusterDuties } from '../common/access/access-rules';

@ApiTags('bnm-notifications')
@Controller({ path: 'bnm-notifications', version: '1' })
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
export class BnmNotificationsController {
  constructor(private readonly service: BnmNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'The PD 13.1 register, outstanding first, overdue flagged' })
  list(@Tenant() tenantContext: TenantContext) {
    assertAdjusterDuties(tenantContext);
    return this.service.list(tenantContext);
  }

  @Post()
  @ApiOperation({ summary: 'Draft a capital/office change by hand (KeyPerson changes draft automatically)' })
  draft(
    @Body() body: { changeType: BnmChangeType; description: string; occurredAt: string },
    @Tenant() tenantContext: TenantContext
  ) {
    assertAdjusterDuties(tenantContext);
    return this.service.draft(
      { ...body, occurredAt: new Date(body.occurredAt) },
      tenantContext.tenantId,
      tenantContext.userId
    );
  }

  @Post(':id/notified')
  @ApiOperation({ summary: 'Record that BNM was told; the submission reference is the proof' })
  markNotified(
    @Param('id') id: string,
    @Body('reference') reference: string,
    @Tenant() tenantContext: TenantContext
  ) {
    assertAdjusterDuties(tenantContext);
    return this.service.markNotified(id, reference, tenantContext);
  }
}
