import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EscalationTrigger } from '@prisma/client';
import { IsEnum } from 'class-validator';

import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { AssessmentService } from './assessment.service';

export class EscalateDto {
  @IsEnum(EscalationTrigger)
  trigger!: EscalationTrigger;
}

/**
 * How a claim is being assessed.
 *
 * Deciding and escalating are adjusting judgements, so both are restricted to
 * adjusters and firm admins. Reading is wider: compliance and SIU need to see
 * why a claim was examined at the level it was.
 */
@ApiTags('assessment')
@Controller({ path: 'claims/:claimId/assessment-mode', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class AssessmentController {
  constructor(private readonly service: AssessmentService) {}

  @Post('decide')
  @ApiOperation({ summary: 'Run the router and record the resulting mode' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  decide(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.decide(claimId, tenantContext);
  }

  @Post('escalate')
  @ApiOperation({ summary: 'Move the claim one level up the assessment ladder' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  escalate(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() dto: EscalateDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.escalate(claimId, dto.trigger, tenantContext);
  }

  @Get()
  @ApiOperation({ summary: 'The current mode and the decision that set it' })
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
  @ApiOperation({ summary: 'Every mode decision, newest first' })
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
