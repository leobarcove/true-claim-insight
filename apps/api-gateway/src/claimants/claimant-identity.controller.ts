import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentTenantContext } from '../auth/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContext, TenantGuard } from '../auth/guards/tenant.guard';
import { ClaimantsService } from './claimants.service';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Recording a claimant's identity standing.
 *
 * Its own controller rather than a method on `ClaimantsController`, whose
 * `verify-nric` is deliberately `@Public()`. Authentication is global now
 * (Sept 2026) and runs before any controller guard, so the tenant guard always
 * sees the user — the ordering trap that once left `tenantContext` undefined
 * here, and verification unrecorded, cannot recur. The separation stays
 * because the two routes have opposite access rules.
 */
@ApiTags('claimants')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Roles('ADJUSTER', 'FIRM_ADMIN')
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
