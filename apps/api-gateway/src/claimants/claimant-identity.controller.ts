import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentTenantContext } from '../auth/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContext, TenantGuard } from '../auth/guards/tenant.guard';
import { ClaimantsService } from './claimants.service';

/**
 * Recording a claimant's identity standing.
 *
 * Its own controller rather than a method on `ClaimantsController`, for a
 * reason that cost an hour: that controller's `verify-nric` is deliberately
 * unauthenticated, so its class-level guard is `TenantGuard` alone. Guards run
 * class-level first, so a method-level `JwtAuthGuard` runs *after* the tenant
 * guard has already looked for a user and found none — leaving
 * `tenantContext` undefined and every check that depended on it silently
 * skipped. Verification succeeded with no basis recorded and no audit row.
 *
 * `JwtAuthGuard, TenantGuard` in that order, at class level, is the pattern the
 * rest of the gateway uses. Follow it.
 */
@ApiTags('claimants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('claimants')
export class ClaimantIdentityController {
  constructor(private readonly claimants: ClaimantsService) {}

  /**
   * Automated eKYC is not integrated (§3), and waiting for it would leave the
   * identity gate on claims permanently unsatisfiable — which is how a control
   * ends up switched off. An operator examining the MyKad already on file is a
   * real basis; what makes it auditable is that this insists on saying what was
   * examined, and records who said it.
   */
  @Patch(':id/identity')
  @ApiOperation({ summary: "Record the claimant's identity standing, with its basis" })
  setIdentity(
    @Param('id') id: string,
    @Body() body: { status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED'; basis?: string },
    @CurrentTenantContext() tenantContext: TenantContext
  ) {
    return this.claimants.updateKycStatus(id, body.status, tenantContext, body.basis);
  }
}
