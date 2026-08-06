import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { QuantumService } from './quantum.service';

/**
 * Quantum worksheets on a claim.
 *
 * Preparing one is adjusting work, so it is restricted to adjusters and firm
 * admins — a support desk vetting intake has no business setting a figure. The
 * worksheet recommends; nothing here approves a claim, and the existing
 * authority and sign-off controls on the claim and the report are unchanged.
 */
@ApiTags('quantum')
@Controller({ path: 'claims/:claimId/quantum', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class QuantumController {
  constructor(private readonly service: QuantumService) {}

  @Post()
  @ApiOperation({ summary: 'Prepare a quantum worksheet, superseding any previous revision' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() dto: CreateWorksheetDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.create(claimId, dto, tenantContext);
  }

  @Get()
  @ApiOperation({ summary: 'The current worksheet for this claim' })
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SIU_INVESTIGATOR,
    UserRole.SUPER_ADMIN
  )
  current(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.current(claimId, tenantContext);
  }

  @Get('history')
  @ApiOperation({ summary: 'Every revision, newest first' })
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SIU_INVESTIGATOR,
    UserRole.SUPER_ADMIN
  )
  history(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.history(claimId, tenantContext);
  }
}
