import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssignmentStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { AssignmentsService, type ReceiveAssignmentInput } from './assignments.service';
import { assertMayAuthorAdjusterWork } from '../common/access/access-rules';

@ApiTags('assignments')
@Controller({ path: 'assignments', version: '1' })
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class AssignmentsController {
  constructor(private readonly service: AssignmentsService) {}

  @Get()
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPPORT_DESK,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'Appointments for this organisation' })
  findAll(@Tenant() tenantContext: TenantContext, @Query('status') status?: AssignmentStatus) {
    return this.service.findAll(tenantContext, status);
  }

  @Get('outstanding')
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPPORT_DESK,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'Appointments awaiting acknowledgement (CSP: 1 working day)' })
  outstanding(@Tenant() tenantContext: TenantContext) {
    return this.service.outstanding(tenantContext);
  }

  @Get(':id')
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPPORT_DESK,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'One appointment' })
  findOne(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.findOne(id, tenantContext);
  }

  @Post()
  @ApiOperation({ summary: 'Log an insurer appointment; starts the acknowledgement clock' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.SUPPORT_DESK)
  receive(@Body() body: ReceiveAssignmentInput, @Tenant() tenantContext: TenantContext) {
    // The caller's tenant becomes the handling firm, so it must be one.
    assertMayAuthorAdjusterWork(tenantContext, 'Recording an appointment');
    return this.service.receive(body, tenantContext.tenantId);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge to the insurer; stops the CSP clock' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.ADJUSTER, UserRole.SUPPORT_DESK)
  acknowledge(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.acknowledge(id, tenantContext);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline the appointment; a reason is required' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  decline(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.decline(id, reason, tenantContext);
  }

  @Post(':id/link-claim')
  @ApiOperation({ summary: 'Attach the claim opened for this appointment' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN, UserRole.ADJUSTER)
  linkClaim(
    @Param('id') id: string,
    @Body('claimId') claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.linkClaim(id, claimId, tenantContext);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Close out the appointment' })
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  complete(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.complete(id, tenantContext);
  }
}
