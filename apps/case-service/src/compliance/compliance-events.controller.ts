import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ComplianceEventSeverity,
  ComplianceEventStatus,
  ComplianceEventType,
} from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { ComplianceEventsService } from './compliance-events.service';

@ApiTags('compliance-events')
@Controller({ path: 'compliance-events', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
export class ComplianceEventsController {
  constructor(private readonly service: ComplianceEventsService) {}

  @Get()
  @ApiOperation({ summary: 'The register, open and unresolved first' })
  list(@Query('status') status?: ComplianceEventStatus) {
    return this.service.list(status);
  }

  @Post()
  @ApiOperation({ summary: 'Raise an event by hand (policy breach, audit gap, other)' })
  raise(
    @Body()
    body: {
      type: ComplianceEventType;
      severity: ComplianceEventSeverity;
      title: string;
      details?: string;
      claimId?: string;
      adjusterId?: string;
    },
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.raise({
      ...body,
      source: 'manual',
      raisedByUserId: tenantContext.userId,
    });
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an open event' })
  acknowledge(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.acknowledge(id, tenantContext);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve with a note — how it was dealt with is what the Board reads' })
  resolve(
    @Param('id') id: string,
    @Body('note') note: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.resolve(id, note, tenantContext);
  }

  @Post('board-report')
  @ApiOperation({ summary: 'Generate the Board report; stamps every included event (PD 11.2(d))' })
  boardReport(@Tenant() tenantContext: TenantContext) {
    return this.service.boardReport(tenantContext);
  }
}
