import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { SlaService } from './sla.service';
import { RecordExceptionalDto } from './dto/record-exceptional.dto';
import { AuditService } from '../common/audit/audit.service';

@ApiTags('sla')
@Controller({ path: 'sla', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class SlaController {
  constructor(
    private readonly sla: SlaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Record an exceptional circumstance on a clock (CSP 10.13).
   *
   * Restricted to those who answer for turnaround: the adjuster working the
   * file, a firm admin, or compliance. Audited without exception — relief the
   * firm grants itself is the first thing an examiner asks about, and "who
   * decided, on what ground, for how long" must be answerable without reading
   * application logs.
   */
  @Post('claims/:claimId/exceptional')
  @ApiOperation({ summary: 'Record a CSP 10.13 exceptional circumstance on a clock' })
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.COMPLIANCE_OFFICER, UserRole.SUPER_ADMIN)
  async recordExceptional(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() dto: RecordExceptionalDto,
    @Tenant() tenantContext: TenantContext
  ) {
    const clock = await this.sla.recordExceptionalCircumstance(claimId, dto.stage, {
      ground: dto.ground,
      reason: dto.reason,
      workingDays: dto.workingDays,
      userId: tenantContext.userId ?? null,
    });

    await this.audit.record({
      entityType: 'CLAIM',
      entityId: claimId,
      action: 'SLA_EXCEPTIONAL_CIRCUMSTANCE_RECORDED',
      newValues: {
        stage: dto.stage,
        ground: dto.ground,
        workingDays: dto.workingDays,
        reason: dto.reason,
        dueAt: clock?.dueAt ?? null,
      },
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
    });

    return clock;
  }

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
