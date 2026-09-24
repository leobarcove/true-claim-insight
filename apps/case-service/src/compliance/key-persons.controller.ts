import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KeyPersonType } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import type { CriterionResponse } from './fit-and-proper';
import { KeyPersonsService } from './key-persons.service';
import { assertAdjusterDuties } from '../common/access/access-rules';

@ApiTags('key-persons')
@Controller({ path: 'key-persons', version: '1' })
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
export class KeyPersonsController {
  constructor(private readonly service: KeyPersonsService) {}

  @Get()
  @ApiOperation({ summary: "The register, with each person's fit-and-proper standing" })
  list(@Tenant() tenantContext: TenantContext, @Query('all') all?: string) {
    assertAdjusterDuties(tenantContext);
    return this.service.list(tenantContext, all === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Register a shareholder or KRP' })
  create(
    @Body()
    body: { fullName: string; type: KeyPersonType; position?: string; appointedAt: string; notes?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    assertAdjusterDuties(tenantContext);
    return this.service.create(body, tenantContext);
  }

  @Get(':id/criteria')
  @ApiOperation({ summary: 'The criteria this person must answer (10.1; +10.2 for KRPs)' })
  criteria(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    assertAdjusterDuties(tenantContext);
    return this.service.criteriaFor(id, tenantContext);
  }

  @Post(':id/attest')
  @ApiOperation({ summary: 'Attest against every applicable criterion; NOT_MET raises a Board event' })
  attest(
    @Param('id') id: string,
    @Body() body: { responses: Record<string, CriterionResponse>; notes?: string },
    @Tenant() tenantContext: TenantContext
  ) {
    assertAdjusterDuties(tenantContext);
    return this.service.attest(id, body.responses, body.notes, tenantContext);
  }

  @Get(':id/attestations')
  @ApiOperation({ summary: 'Attestation history' })
  attestations(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    assertAdjusterDuties(tenantContext);
    return this.service.attestations(id, tenantContext);
  }

  @Post(':id/cease')
  @ApiOperation({ summary: 'Record cessation — the future PD 13.1 notification trigger' })
  cease(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    assertAdjusterDuties(tenantContext);
    return this.service.cease(id, tenantContext);
  }
}
