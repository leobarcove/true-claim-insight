import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { ClaimExportService } from './claim-export.service';

@ApiTags('claim-export')
@Controller({ path: 'claims', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ClaimExportController {
  constructor(private readonly service: ClaimExportService) {}

  @Get(':id/export')
  @ApiOperation({
    summary: 'Complete claim file (FSA s.143) — compliance roles only, hash-sealed and audited',
  })
  // Producing the full file — decrypted NRIC included — is a regulator-facing
  // act, not day-to-day claims handling.
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  export(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.exportClaimFile(id, tenantContext);
  }
}
