import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FraudSignalOrchestrator } from './fraud-signal-orchestrator.service';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { TenantService } from '../tenant/tenant.service';

/**
 * Minimal HTTP surface for fraud signals. This is the "skeleton" of the
 * provider plugin architecture — concrete providers (MetMalaysia, JPS, etc.)
 * are added by registering them in FraudSignalsModule. The orchestrator
 * routes each claim through every applicable provider.
 *
 * In production these endpoints would be called by:
 *  - case-service: automatically after claim creation (post-FNOL hook)
 *  - assessments pipeline: re-evaluation when new evidence arrives
 *  - adjuster UI: manual "re-run risk checks" button
 *
 * Guarded like every other risk-engine controller. Until September 2026 it
 * had no guard at all: anyone who could reach the port could read or run a
 * claim's fraud signals, and through the gateway a caller from any tenant
 * could name another tenant's claim.
 */
@ApiTags('fraud-signals')
@Controller({ path: 'fraud-signals', version: '1' })
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class FraudSignalsController {
  constructor(
    private readonly orchestrator: FraudSignalOrchestrator,
    private readonly tenants: TenantService
  ) {}

  @Post('claims/:claimId/evaluate')
  @ApiOperation({
    summary: 'Run all applicable fraud-signal providers for a claim',
  })
  async evaluate(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    await this.tenants.validateClaimAccess(claimId, tenantContext);
    return this.orchestrator.evaluateClaim(claimId);
  }

  @Get('claims/:claimId')
  @ApiOperation({ summary: 'List persisted fraud signals for a claim' })
  async list(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    await this.tenants.validateClaimAccess(claimId, tenantContext);
    return this.orchestrator.listForClaim(claimId);
  }
}
