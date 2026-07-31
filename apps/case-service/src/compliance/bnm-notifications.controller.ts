import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BnmChangeType } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { BnmNotificationsService } from './bnm-notifications.service';

@ApiTags('bnm-notifications')
@Controller({ path: 'bnm-notifications', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
export class BnmNotificationsController {
  constructor(private readonly service: BnmNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'The PD 13.1 register, outstanding first, overdue flagged' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Draft a capital/office change by hand (KeyPerson changes draft automatically)' })
  draft(
    @Body() body: { changeType: BnmChangeType; description: string; occurredAt: string },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.draft(
      { ...body, occurredAt: new Date(body.occurredAt) },
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
    return this.service.markNotified(id, reference, tenantContext);
  }
}
